/** Reads packaged skill files without ever leaving the skills root. */
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, normalize, relative } from 'node:path';
import { clampText } from './text.js';

/**
 * Resolve a skill-relative path inside a root, refusing absolute paths and
 * any `..` traversal (including traversal hidden mid-path).
 * @param {string} root - absolute skills root.
 * @param {string} rel - path as written in a SKILL.md, POSIX or Windows separators.
 * @returns {string|null} absolute path inside root, or null when refused.
 */
export function resolveInside(root, rel) {
  if (typeof rel !== 'string' || rel.length === 0) return null;
  const cleaned = rel.replace(/\\/g, '/');
  if (cleaned.startsWith('/') || cleaned.startsWith('//') || /^[a-zA-Z]:/.test(cleaned)) return null;

  const absoluteRoot = normalize(root);
  const target = normalize(join(absoluteRoot, cleaned));
  const fromRoot = relative(absoluteRoot, target);
  if (fromRoot === '') return target;
  if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) return null;
  return target;
}

/**
 * Read a file only when it stays within a byte budget.
 * @param {string} file - absolute file path already validated by resolveInside.
 * @param {number} maxBytes - byte ceiling.
 * @returns {Promise<{text?: string, tooLarge: boolean, size: number}>} content or refusal.
 */
export async function readCapped(file, maxBytes) {
  const info = await stat(file);
  if (info.size > maxBytes) return { tooLarge: true, size: info.size };
  return { text: await readFile(file, 'utf8'), tooLarge: false, size: info.size };
}

/**
 * Read a text file for the model, truncating very long content instead of
 * failing on it, so a 362 KB catalog file stays usable.
 * @param {string} file - absolute file path already validated by resolveInside.
 * @param {{maxChars?: number, maxBytes?: number}} [limits] - char budget and hard byte ceiling.
 * @returns {Promise<{text?: string, truncated?: boolean, tooLarge?: boolean, binary?: boolean, size: number}>}
 *   the text (already clamped), or a refusal flag with the file size.
 */
export async function readText(file, { maxChars = 40000, maxBytes = 2 * 1024 * 1024 } = {}) {
  const info = await stat(file);
  if (info.size > maxBytes) return { tooLarge: true, size: info.size };
  const raw = await readFile(file, 'utf8');
  if (raw.includes('\u0000')) return { binary: true, size: info.size };
  return { text: clampText(raw, maxChars), truncated: raw.length > maxChars, size: info.size };
}
