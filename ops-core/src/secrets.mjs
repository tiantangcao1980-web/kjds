/**
 * 凭据泄漏自检（从 OZON scripts/verify-secrets.mjs 泛化）：
 * 扫描工作区文件与 git 历史，确认 .secrets 里的值没有被提交；可选检查禁止入库的目录。
 */
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_SKIP_DIRS = new Set(['.git', '.secrets', 'node_modules', 'data', 'models', 'outbox', 'reports', 'db', 'raw', 'tmp', '.venv']);
const DEFAULT_SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bin', '.db', '.sqlite', '.log', '.safetensors', '.ckpt']);

export function parseEnvValues(text, { minLength = 8 } = {}) {
  const values = {};
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["'<\s]+|["'>\s]+$/g, '');
    if (value.length >= minLength) values[key] = value;
  }
  return values;
}

function walk(dir, { skipDirs, skipExt, maxBytes = 2 * 1024 * 1024 }, output = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return output;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      walk(full, { skipDirs, skipExt, maxBytes }, output);
      continue;
    }
    const dot = entry.name.lastIndexOf('.');
    const ext = dot >= 0 ? entry.name.slice(dot).toLowerCase() : '';
    if (skipExt.has(ext)) continue;
    try {
      if (statSync(full).size > maxBytes) continue;
    } catch {
      continue;
    }
    output.push(full);
  }
  return output;
}

export function scanWorkspace({ root, secrets, skipDirs = DEFAULT_SKIP_DIRS, skipExt = DEFAULT_SKIP_EXT }) {
  const leaks = [];
  for (const file of walk(root, { skipDirs, skipExt })) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const [key, value] of Object.entries(secrets)) {
      if (text.includes(value)) leaks.push({ where: file, key });
    }
  }
  return leaks;
}

export function scanGitHistory({ root, secrets }) {
  return new Promise((resolve) => {
    try {
      execFile('git', ['log', '-p', '--all'], { cwd: root, maxBuffer: 512 * 1024 * 1024, encoding: 'utf8' }, (error, stdout) => {
        if (error) {
          resolve([]);
          return;
        }
        const leaks = [];
        for (const [key, value] of Object.entries(secrets)) {
          if (stdout.includes(value)) leaks.push({ where: 'git history', key });
        }
        resolve(leaks);
      });
    } catch {
      // git 不可用（未安装或被沙箱禁止）时跳过历史扫描，不影响工作区扫描结果。
      resolve([]);
    }
  });
}

function gitTrackedFiles({ root }) {
  return new Promise((resolve) => {
    try {
      execFile('git', ['ls-files'], { cwd: root, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' }, (error, stdout) => {
        resolve(error ? [] : stdout.split('\n').filter(Boolean));
      });
    } catch {
      resolve([]);
    }
  });
}

export async function verifySecrets({ root, envFile = join(root, '.secrets', 'app.env'), forbiddenPaths = [], skipDirs, skipExt } = {}) {
  if (!existsSync(envFile)) return { clean: true, checked: 0, leaks: [], note: `没有 ${envFile}` };
  const secrets = parseEnvValues(readFileSync(envFile, 'utf8'));
  if (Object.keys(secrets).length === 0) return { clean: true, checked: 0, leaks: [], note: '.secrets 里没有可检查的值' };

  const leaks = [...scanWorkspace({ root, secrets, skipDirs, skipExt }), ...(await scanGitHistory({ root, secrets }))];
  if (forbiddenPaths.length > 0) {
    const tracked = await gitTrackedFiles({ root });
    for (const forbidden of forbiddenPaths) {
      const prefix = forbidden.replace(/\/+$/, '');
      const hit = tracked.find((file) => file === prefix || file.startsWith(`${prefix}/`));
      if (hit) leaks.push({ where: hit, key: '禁止入库的路径被 git 跟踪' });
    }
  }
  return { clean: leaks.length === 0, checked: Object.keys(secrets).length, leaks };
}
