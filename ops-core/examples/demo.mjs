/**
 * 端到端示例：不连真实平台，用内存库 + 假 API 演示 ops-core 的接线方式。
 * 运行：node examples/demo.mjs
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  openDatabase,
  createHttpClient,
  createAlertEngine,
  stockoutRule,
  renderMarkdownReport,
  renderDashboardHtml,
  createActionGuard,
  maskId,
} from '../src/index.mjs';

const MIGRATIONS = [
  {
    version: 1,
    sql: `CREATE TABLE products (offer_id TEXT PRIMARY KEY, name TEXT, archived INTEGER DEFAULT 0);
          CREATE TABLE api_calls (id INTEGER PRIMARY KEY AUTOINCREMENT, status INTEGER, called_at TEXT);`,
  },
];

const db = openDatabase({ filePath: ':memory:', migrations: MIGRATIONS });
db.migrate();
db.db.prepare("INSERT INTO products (offer_id, name, archived) VALUES ('SPATULA-28','Силиконовая лопатка',0)").run();
db.db.prepare("INSERT INTO products (offer_id, name, archived) VALUES ('OLD-1','Архив',1)").run();

const api = createHttpClient({
  baseUrl: 'https://api.example.com',
  headers: { 'X-Client-Id': '1234567', 'X-Api-Key': 'secret' },
  fetchImpl: async () => ({ ok: true, status: 200, text: async () => '{"result":"ok"}', headers: { get: () => null } }),
  audit: ({ status }) => db.db.prepare('INSERT INTO api_calls (status, called_at) VALUES (?, ?)').run(status, new Date().toISOString()),
});
await api.request('/v1/ping', { body: { hello: true } });

const alerts = createAlertEngine({
  rules: [
    stockoutRule({ sql: 'SELECT offer_id, 0 AS available FROM products WHERE archived = 0' }),
    () => (Math.random() < 0.5 ? [{ type: 'demo', severity: 'P2', message: '示例 P2 预警' }] : []),
  ],
}).evaluate({ db: db.db });

const date = new Date().toISOString().slice(0, 10);
const markdown = renderMarkdownReport({
  title: '运营日报',
  date,
  cards: [
    { label: 'Client-Id', value: maskId('1234567') },
    { label: '预警数', value: alerts.length },
  ],
  todos: alerts.map((alert) => `[${alert.severity}] ${alert.message}`),
});
const html = renderDashboardHtml({
  title: '运营看板',
  date,
  cards: [{ label: '预警', value: alerts.length }],
  alerts,
  series: [
    { date: '2026-11-04', value: 3 },
    { date: '2026-11-05', value: 5 },
    { date: '2026-11-06', value: 8 },
  ],
});

const guard = createActionGuard({
  db: db.db,
  whitelist: { stock_update: { path: '/v2/stocks', limitPerDay: 50 } },
});
const proposal = guard.propose({ action: 'stock_update', target: 'SPATULA-28', payload: { stock: 25 } });
const dry = await guard.approve({ id: proposal.id, code: proposal.code, api: { request: async () => ({ json: {} }) } });

const dir = mkdtempSync(join(tmpdir(), 'ops-demo-'));
writeFileSync(join(dir, 'daily.md'), markdown, 'utf8');
writeFileSync(join(dir, 'dashboard.html'), html, 'utf8');

console.log(`client=${maskId('1234567')} alerts=${alerts.length}`);
console.log(`proposal #${proposal.id} code=${proposal.code} dryRunExecuted=${dry.executed}`);
console.log(`reports: ${join(dir, 'daily.md')} , ${join(dir, 'dashboard.html')}`);
console.log('---');
console.log(markdown);
