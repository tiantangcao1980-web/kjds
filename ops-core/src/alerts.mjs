/**
 * 预警引擎：规则是纯函数 (ctx) => Alert[]，引擎只负责排序/去重/截断。
 * 平台项目各自提供规则（断货、发货超时、价格指数、退货率、数据陈旧…）。
 */
const SEVERITY_ORDER = { P0: 0, P1: 1, P2: 2 };

export function createAlertEngine({ rules = [], dedupe = true, limit = 100 } = {}) {
  function evaluate(ctx) {
    const all = [];
    for (const rule of rules) {
      const produced = rule(ctx) ?? [];
      for (const alert of produced) {
        if (!alert || !alert.type) continue;
        all.push({ severity: 'P1', ...alert });
      }
    }
    const seen = new Set();
    const filtered = all.filter((alert) => {
      if (!dedupe) return true;
      const key = `${alert.type}|${alert.target ?? ''}|${alert.message ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return filtered
      .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))
      .slice(0, limit);
  }
  return { evaluate };
}

export function stockoutRule({ sql }) {
  return ({ db }) =>
    db
      .prepare(sql)
      .all()
      .map((row) => ({
        type: 'stockout',
        severity: 'P0',
        target: row.offer_id ?? row.sku,
        message: `断货：${row.offer_id ?? row.sku}（可用 ${row.available ?? 0}）`,
      }));
}

export function staleDataRule({ table = 'api_calls', hours = 48, now = () => new Date() }) {
  return ({ db }) => {
    const row = db.prepare(`SELECT MAX(called_at) AS last FROM ${table} WHERE status = 200`).get();
    if (!row?.last) return [];
    const ageHours = (now().getTime() - new Date(row.last).getTime()) / 3_600_000;
    if (ageHours <= hours) return [];
    return [{ type: 'stale_data', severity: 'P1', message: `数据已 ${ageHours.toFixed(0)} 小时未更新` }];
  };
}
