import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  parseEnvText,
  maskId,
  loadEnvConfig,
  ConfigError,
  openDatabase,
  createSettingsStore,
  createHttpClient,
  HttpError,
  createAlertEngine,
  stockoutRule,
  staleDataRule,
  renderMarkdownReport,
  renderDashboardHtml,
  createActionGuard,
  ActionError,
  buildCurlFetchArgs,
  inspectImageSize,
  renderTextPng,
  resolvePython,
} from '../src/index.mjs';

const MIGRATIONS = [
  { version: 1, sql: 'CREATE TABLE products (offer_id TEXT PRIMARY KEY, name TEXT, archived INTEGER DEFAULT 0);' },
  { version: 2, sql: 'CREATE TABLE api_calls (id INTEGER PRIMARY KEY, status INTEGER, called_at TEXT);' },
];

test('parseEnvText strips <>" and ignores comments', () => {
  const vars = parseEnvText('# c\nA=<123>\nB="value"\n\nC = plain ');
  assert.equal(vars.A, '123');
  assert.equal(vars.B, 'value');
  assert.equal(vars.C, 'plain');
  assert.equal(maskId('5344502'), '5344***');
});

test('loadEnvConfig throws MISSING_CREDENTIALS when required keys absent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ops-env-'));
  try {
    writeFileSync(join(dir, 'app.env'), 'A=1\n', 'utf8');
    assert.throws(
      () => loadEnvConfig({ root: dir, envFile: join(dir, 'app.env'), required: ['A', 'B'] }),
      (error) => error instanceof ConfigError && error.code === 'MISSING_CREDENTIALS',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('openDatabase applies migrations once and settings store round-trips', () => {
  const handle = openDatabase({ migrations: MIGRATIONS });
  try {
    const first = handle.migrate();
    const second = handle.migrate();
    assert.equal(first.version, 2);
    assert.equal(second.applied, 0);
    const settings = createSettingsStore(handle);
    settings.set('k', 'v');
    assert.equal(settings.get('k'), 'v');
  } finally {
    handle.close();
  }
});

test('http client retries on 429 using Retry-After and audits calls', async () => {
  const audits = [];
  const responses = [
    { status: 429, body: '{"message":"slow down"}', headers: { get: () => '1' } },
    { status: 200, body: '{"ok":true}', headers: { get: () => null } },
  ];
  const client = createHttpClient({
    baseUrl: 'https://api.example.com',
    audit: (entry) => audits.push(entry),
    sleep: async () => {},
    fetchImpl: async () => {
      const next = responses.shift();
      return { ok: next.status < 400, status: next.status, text: async () => next.body, headers: next.headers };
    },
  });
  const result = await client.request('/v1/ping', { body: { a: 1 } });
  assert.deepEqual(result.json, { ok: true });
  assert.equal(audits.length, 2);
});

test('http client throws typed HttpError on 4xx without retry', async () => {
  let calls = 0;
  const client = createHttpClient({
    baseUrl: 'https://api.example.com',
    sleep: async () => {},
    fetchImpl: async () => {
      calls += 1;
      return { ok: false, status: 403, text: async () => 'forbidden', headers: { get: () => null } };
    },
  });
  await assert.rejects(() => client.request('/x'), (error) => error instanceof HttpError && error.status === 403);
  assert.equal(calls, 1);
});

test('alert engine merges rules, dedupes and sorts by severity', () => {
  const handle = openDatabase({ migrations: MIGRATIONS });
  try {
    handle.migrate();
    handle.db.prepare("INSERT INTO products (offer_id, name, archived) VALUES ('A','x',0)").run();
    const engine = createAlertEngine({
      rules: [
        stockoutRule({ sql: "SELECT offer_id, 0 AS available FROM products WHERE archived = 0" }),
        () => [{ type: 'manual', severity: 'P2', message: 'low priority' }],
        () => [{ type: 'manual', severity: 'P2', message: 'low priority' }],
      ],
    });
    const alerts = engine.evaluate({ db: handle.db });
    assert.equal(alerts.length, 2);
    assert.equal(alerts[0].severity, 'P0');
  } finally {
    handle.close();
  }
});

test('staleDataRule flags old api calls', () => {
  const handle = openDatabase({ migrations: MIGRATIONS });
  try {
    handle.migrate();
    handle.db.prepare("INSERT INTO api_calls (status, called_at) VALUES (200, '2026-01-01T00:00:00Z')").run();
    const rule = staleDataRule({ hours: 48, now: () => new Date('2026-01-10T00:00:00Z') });
    const alerts = rule({ db: handle.db });
    assert.equal(alerts[0].type, 'stale_data');
  } finally {
    handle.close();
  }
});

test('report renders markdown and dashboard with inline svg', () => {
  const markdown = renderMarkdownReport({
    title: '日报',
    date: '2026-11-06',
    cards: [{ label: '订单', value: 10 }],
    tables: [{ title: '明细', columns: ['a'], rows: [[1]] }],
    todos: ['[P0] 断货'],
  });
  assert.match(markdown, /订单/);
  assert.match(markdown, /断货/);
  const html = renderDashboardHtml({
    title: '看板',
    date: '2026-11-06',
    cards: [{ label: '订单', value: 10 }],
    alerts: [{ severity: 'P0', message: '断货 <A>' }],
    series: [{ date: '2026-11-05', value: 3 }],
  });
  assert.match(html, /<svg/);
  assert.match(html, /&lt;A&gt;/);
  assert.ok(!/<script src=/i.test(html));
});

test('action guard enforces code, dry-run and daily limit', async () => {
  const handle = openDatabase({ migrations: MIGRATIONS });
  try {
    handle.migrate();
    const guard = createActionGuard({
      db: handle.db,
      whitelist: { price_update: { path: '/v1/prices', limitPerDay: 1 } },
      randomCode: () => '123456',
    });
    const proposal = guard.propose({ action: 'price_update', payload: { price: 1 } });
    await assert.rejects(() => guard.approve({ id: proposal.id, code: '000000', api: {} }), (e) => e instanceof ActionError && e.code === 'CODE_MISMATCH');
    const dry = await guard.approve({ id: proposal.id, code: '123456', api: { request: async () => ({ json: {} }) } });
    assert.equal(dry.executed, false);
    const second = guard.propose({ action: 'price_update', payload: { price: 2 } });
    const executed = await guard.approve({ id: second.id, code: '123456', api: { request: async () => ({ json: { ok: true } }) }, execute: true });
    assert.equal(executed.executed, true);
    const third = guard.propose({ action: 'price_update', payload: { price: 3 } });
    await assert.rejects(() => guard.approve({ id: third.id, code: '123456', api: { request: async () => ({ json: {} }) }, execute: true }), (e) => e.code === 'DAILY_LIMIT');
  } finally {
    handle.close();
  }
});

test('image helpers: curl args, png size detection and cyrillic text layer', (t) => {
  const args = buildCurlFetchArgs({ url: 'https://x/y.png', output: 'y.png', proxy: 'http://127.0.0.1:7897' });
  assert.ok(args.includes('-x'));
  const probe = spawnSync(resolvePython(), ['-c', 'import PIL'], { stdio: 'ignore' });
  if (probe.error || probe.status !== 0) {
    t.skip('本机没有带 Pillow 的 Python（设置 PYTHON_PATH 后可运行该测试）');
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'ops-img-'));
  try {
    const png = join(dir, 'text.png');
    renderTextPng({ text: 'Лопатка кухонная', outputPath: png, width: 900, height: 220, fontSize: 72 });
    const size = inspectImageSize(png);
    assert.equal(size.width, 900);
    assert.equal(size.height, 220);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('action guard counts payload items, enforces TTL and marks unknown on network errors', async () => {
  const { createActionGuard, ActionError, CODE_TTL_MS } = await import('../src/actions.mjs');
  const handle = openDatabase({ migrations: [{ version: 1, sql: 'CREATE TABLE products (offer_id TEXT PRIMARY KEY);' }] });
  try {
    handle.migrate();
    let code = '123456';
    const guard = createActionGuard({
      db: handle.db,
      whitelist: { price_update: { path: '/v1/prices', limitPerDay: 3, itemsKey: 'prices' } },
      randomCode: () => code,
    });
    assert.throws(
      () => guard.propose({ action: 'price_update', payload: { prices: Array.from({ length: 10 }, () => ({})) } }),
      (error) => error instanceof ActionError && error.code === 'PAYLOAD_TOO_LARGE',
    );
    const proposal = guard.propose({ action: 'price_update', payload: { prices: [{}, {}] } });
    assert.equal(proposal.items, 2);

    const calls = [];
    const failingApi = { request: async (_path, opts) => { calls.push(opts); const error = new Error('timeout'); error.code = 'NETWORK_ERROR'; throw error; } };
    await assert.rejects(() => guard.approve({ id: proposal.id, code, api: failingApi, execute: true }));
    assert.equal(calls[0].maxRetries, 0, '写操作必须不重试');
    assert.equal(guard.list()[0].status, 'unknown');

    const expired = guard.propose({ action: 'price_update', payload: { prices: [{}] } });
    const old = new Date(Date.now() - CODE_TTL_MS - 1000).toISOString();
    handle.db.prepare('UPDATE actions_log SET created_at = ? WHERE id = ?').run(old, expired.id);
    await assert.rejects(() => guard.approve({ id: expired.id, code, api: failingApi }), (error) => error.code === 'CODE_EXPIRED');
  } finally {
    handle.close();
  }
});

test('verifySecrets flags a leaked value but ignores the secrets file itself', async () => {
  const { mkdtempSync, rmSync, writeFileSync, mkdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { verifySecrets } = await import('../src/secrets.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'ops-secrets-'));
  try {
    mkdirSync(join(dir, '.secrets'), { recursive: true });
    writeFileSync(join(dir, '.secrets', 'app.env'), 'TOKEN=<super-secret-token-123>\n', 'utf8');
    writeFileSync(join(dir, 'leak.txt'), 'prefix super-secret-token-123 suffix', 'utf8');
    const result = await verifySecrets({ root: dir });
    assert.equal(result.clean, false);
    assert.ok(result.leaks.some((leak) => leak.key === 'TOKEN'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('dashboard server serves state and streams SSE frames', async () => {
  const { createDashboardServer } = await import('../src/monitor.mjs');
  let tick = 0;
  const server = createDashboardServer({ stateProvider: () => ({ tick: (tick += 1), cards: [] }), port: 0, sseIntervalMs: 50 });
  const url = await server.listen();
  try {
    const state = await (await fetch(`${url}/api/state`)).json();
    assert.ok(typeof state.tick === 'number');
    const controller = new AbortController();
    const response = await fetch(`${url}/events`, { signal: controller.signal });
    const reader = response.body.getReader();
    const chunk = await reader.read();
    const text = new TextDecoder().decode(chunk.value);
    assert.match(text, /event: state/);
    assert.match(text, /data: \{"tick"/);
    controller.abort();
    await reader.cancel().catch(() => {});
  } finally {
    await server.close();
  }
});
