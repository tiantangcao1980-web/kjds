/**
 * 配置加载：.secrets/<name>.env 逐行 KEY=VALUE，忽略注释；值里的 <> "' 空格都剥掉。
 * 凭据只留在内存和打码字段里，不写日志。
 */
import { existsSync, readFileSync } from 'node:fs';

export class ConfigError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ConfigError';
    this.code = code;
  }
}

export function parseEnvText(text = '') {
  const result = {};
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^["'<\s]+|["'>\s]+$/g, '');
    result[key] = value;
  }
  return result;
}

export function maskId(value) {
  const text = String(value ?? '');
  if (text.length <= 4) return text ? '***' : '';
  return `${text.slice(0, 4)}***`;
}

export function loadEnvConfig({ root, envFile, required = [], now = () => new Date() } = {}) {
  const filePath = envFile ?? `${root}/.secrets/app.env`;
  const fileVars = existsSync(filePath) ? parseEnvText(readFileSync(filePath, 'utf8')) : {};
  const merged = { ...fileVars, ...(process.env ?? {}) };
  const missing = required.filter((key) => !merged[key]);
  if (missing.length > 0) {
    throw new ConfigError('MISSING_CREDENTIALS', `缺少配置：${missing.join(', ')}（写入 ${filePath}）`);
  }
  return { vars: merged, filePath, loadedAt: now().toISOString() };
}
