/**
 * 写操作护栏（从 OZON 项目实战版本移植）：
 * - 白名单 + 提案确认码（crypto.randomInt，15 分钟 TTL，一次性）
 * - 限额按「受影响条目数」，不是请求数（一次 import 可能带几百条）
 * - 写接口不重试；无法确认是否生效时记 unknown，避免人工误判重复执行
 * - 默认 dry-run，执行必须显式传 execute: true
 */
import { randomInt } from 'node:crypto';

export class ActionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ActionError';
    this.code = code;
  }
}

export const CODE_TTL_MS = 15 * 60 * 1000;

const DDL = `CREATE TABLE IF NOT EXISTS actions_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  target TEXT,
  payload_json TEXT,
  risk TEXT,
  status TEXT NOT NULL,
  code TEXT,
  items INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  executed_at TEXT,
  executed_by TEXT,
  result_json TEXT
)`;

export function countItems(whitelist, action, payload = {}) {
  const spec = whitelist[action] ?? {};
  if (!spec.itemsKey) return 1;
  const list = payload?.[spec.itemsKey];
  return Array.isArray(list) ? list.length : 1;
}

export function createActionGuard({ db, whitelist, now = () => new Date().toISOString(), randomCode = () => String(randomInt(100000, 1000000)) }) {
  db.exec(DDL);

  function propose({ action, target = null, payload = {}, risk = 'mid' }) {
    const spec = whitelist[action];
    if (!spec) throw new ActionError('UNKNOWN_ACTION', `不支持的写操作：${action}`);
    const items = countItems(whitelist, action, payload);
    if (items <= 0) throw new ActionError('EMPTY_PAYLOAD', '提案没有可执行条目');
    if (items > spec.limitPerDay) {
      throw new ActionError('PAYLOAD_TOO_LARGE', `单次 ${action} 含 ${items} 条，超过单日上限 ${spec.limitPerDay}，请拆成多个提案`);
    }
    const code = randomCode();
    const info = db
      .prepare('INSERT INTO actions_log (action, target, payload_json, risk, status, code, items, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(action, target, JSON.stringify(payload), risk, 'proposed', code, items, now());
    return { id: Number(info.lastInsertRowid), code, action, target, payload, items, path: spec.path };
  }

  function list({ status = null } = {}) {
    if (status) return db.prepare('SELECT * FROM actions_log WHERE status = ? ORDER BY id DESC').all(status);
    return db.prepare('SELECT * FROM actions_log ORDER BY id DESC').all();
  }

  async function approve({ id, code, api, execute = false, executedBy = 'cli', today = new Date().toISOString().slice(0, 10) }) {
    const row = db.prepare('SELECT * FROM actions_log WHERE id = ?').get(id);
    if (!row) throw new ActionError('ACTION_NOT_FOUND', `没有编号为 ${id} 的提案`);
    if (!['proposed', 'approved'].includes(row.status)) throw new ActionError('ACTION_STATUS', `提案 ${id} 状态 ${row.status}，不能批准`);
    if (String(code) !== String(row.code)) throw new ActionError('CODE_MISMATCH', '确认码不匹配');

    const createdAt = new Date(row.created_at).getTime();
    if (Number.isFinite(createdAt) && Date.now() - createdAt > CODE_TTL_MS) {
      throw new ActionError('CODE_EXPIRED', '确认码已过期（超过 15 分钟），请重新提案');
    }

    const spec = whitelist[row.action];
    if (!spec) throw new ActionError('UNKNOWN_ACTION', `不支持的写操作：${row.action}`);
    const payload = JSON.parse(row.payload_json ?? '{}');
    const items = Number(row.items ?? countItems(whitelist, row.action, payload)) || 1;

    const executedItems = Number(
      db
        .prepare("SELECT COALESCE(SUM(items), 0) AS n FROM actions_log WHERE action = ? AND status = 'executed' AND executed_at LIKE ?")
        .get(row.action, `${today}%`).n,
    );
    if (executedItems + items > spec.limitPerDay) {
      throw new ActionError('DAILY_LIMIT', `${row.action} 今日已执行 ${executedItems} 条，本次 ${items} 条，超过上限 ${spec.limitPerDay}`);
    }

    if (!execute) {
      db.prepare('UPDATE actions_log SET status = ?, executed_by = ? WHERE id = ?').run('approved', executedBy, id);
      return { executed: false, path: spec.path, payload, items };
    }

    try {
      const response = await api.request(spec.path, { method: spec.method ?? 'POST', body: payload, maxRetries: 0 });
      db.prepare('UPDATE actions_log SET status = ?, executed_at = ?, executed_by = ?, result_json = ? WHERE id = ?').run(
        'executed',
        now(),
        executedBy,
        JSON.stringify(response?.json ?? {}),
        id,
      );
      return { executed: true, path: spec.path, response: response?.json, items };
    } catch (error) {
      const status = error?.status >= 400 && error.status < 500 && error.status !== 429 ? 'failed' : 'unknown';
      db.prepare('UPDATE actions_log SET status = ?, result_json = ? WHERE id = ?').run(
        status,
        JSON.stringify({ message: String(error?.message ?? error), code: error?.code ?? null }),
        id,
      );
      throw error;
    }
  }

  return { propose, list, approve };
}
