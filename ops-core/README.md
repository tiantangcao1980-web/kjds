# ops-core · 跨平台运营系统内核

从一个 Ozon 运营实战项目里提炼出来的可复用层：**配置 → SQLite → HTTP → 规则 → 报表 → 写操作护栏 → 图片工具**。
Ozon 项目用它跑通了取数、选品、日报、预警、翻译、上架、竞品视觉与 AI 生图；这里的版本去掉了平台字段，Ozon / Amazon / 其它平台都能直接接。

## 模块

| 模块 | 能力 | 关键约束 |
|---|---|---|
| `src/config.mjs` | `.secrets/*.env` 解析（剥 `<>"'`、忽略注释）、必填校验、ID 打码 | 凭据只在内存；`maskId` 用于输出 |
| `src/db.mjs` | `node:sqlite` 打开、版本化迁移（`PRAGMA user_version`）、`upsert`、settings | 迁移只增不改；重复调用无副作用 |
| `src/http.mjs` | 统一请求：429 读 `Retry-After`、5xx 退避、超时、审计回调 | 4xx 不重试；错误统一 `HttpError` |
| `src/alerts.mjs` | 规则即纯函数 `(ctx) => Alert[]`，引擎负责去重/排序/截断 | 级别固定 P0/P1/P2 |
| `src/report.mjs` | 日报/周报 Markdown + 单文件看板 HTML（内联 CSS/SVG） | 看板不引外部资源，本地双击可看 |
| `src/actions.mjs` | 提案 → 确认码（crypto、15 分钟 TTL）→ 默认 dry-run → **按条目限额** → 审计 | 写操作永远不自动执行；写接口不重试，无法确认记 `unknown` |
| `src/images.mjs` | Pillow 文字层（俄语/中文）、代理下载、PNG/JPEG 尺寸 | jimp 位图字体只有拉丁字母，非拉丁文字必须走 Pillow |
| `src/secrets.mjs` | 凭据泄漏自检：扫工作区 + git 历史 + 禁止入库路径 | 发布/打包前跑一次 |
| `src/monitor.mjs` | 实时看板服务：`/api/state` + `/events`（SSE）+ `/healthz` | 只依赖 stateProvider，不绑定任何平台 |

## 五分钟接入一个新平台

```js
import {
  loadEnvConfig, maskId, openDatabase, createHttpClient,
  createAlertEngine, stockoutRule, renderMarkdownReport, createActionGuard,
} from '@local/ops-core';

const { vars } = loadEnvConfig({ root: '.', required: ['APP_CLIENT_ID', 'APP_API_KEY'] });
console.log('client', maskId(vars.APP_CLIENT_ID));

const db = openDatabase({ filePath: 'db/app.db', migrations: MY_MIGRATIONS });
db.migrate();

const api = createHttpClient({
  baseUrl: 'https://api.example.com',
  headers: { 'X-Client-Id': vars.APP_CLIENT_ID, 'X-Api-Key': vars.APP_API_KEY },
  audit: ({ url, status }) => db.db.prepare('INSERT INTO api_calls (status, called_at) VALUES (?, ?)').run(status, new Date().toISOString()),
});

const alerts = createAlertEngine({ rules: [stockoutRule({ sql: STOCKOUT_SQL })] }).evaluate({ db: db.db });
const markdown = renderMarkdownReport({ title: '日报', date: '2026-11-06', cards: [{ label: '订单', value: 12 }], todos: alerts.map((a) => `[${a.severity}] ${a.message}`) });

const guard = createActionGuard({ db: db.db, whitelist: { price_update: { path: '/v1/prices', limitPerDay: 20 } } });
const proposal = guard.propose({ action: 'price_update', payload: { sku: 'A', price: 199 } });
// 把 proposal.code 交给用户；批准只能走 CLI，且默认 dry-run
```

## 铁律（从 OZON 项目踩坑总结）

1. **凭据只在 `.secrets/`**，任何输出打码，Key 不进日志/报告/测试。
2. **写操作**：提案 + 确认码 + 限额 + 默认 dry-run，批准只由终端执行。
3. **货币口径分离**：GMV 与结算可能是不同币种，落库必须带 `currency_code`，对账前先校验。
4. **数据陈旧要报出来**：`staleDataRule` 默认 48h。
5. **报表与看板同源**：同一份指标渲染 Markdown 和 HTML，避免两套数字。
6. **非拉丁文字用 Pillow**，别指望 jimp 位图字体。

## 测试

```bash
cd ops-core && node --test
```

10 个测试覆盖：env 解析/缺凭据、迁移幂等、429 重试与审计、4xx 不重试、预警合并排序、陈旧数据、报表渲染与 HTML 转义、写操作护栏（错码/dry-run/限额）、图片尺寸与西里尔文字层。

## 从 OZON 项目同步过来的护栏（2026-11-09）

- **按条目限额**：`whitelist[action].itemsKey` 指向 payload 里的数组（如 prices/stocks），限额统计 SUM(items)，单提案超限直接 PAYLOAD_TOO_LARGE。
- **确认码**：crypto.randomInt 生成 6 位，15 分钟 TTL（CODE_EXPIRED），批准后状态流转。
- **写接口不重试**：approve 调 api.request(..., { maxRetries: 0 })；网络错误/超时记 unknown（不是 failed），避免人工误判后重复执行；明确 4xx 才记 failed。
- **实时看板**：createDashboardServer({ stateProvider }) 起本地服务，/events 走 SSE，前端断线自动重连；配 renderDashboardHtml 即是 WorldMonitor 风格作战室。
- **凭据自检**：verifySecrets({ root, envFile, forbiddenPaths: ['data'] }) 返回 { clean, leaks }，可挂 CI 或发布前脚本。

测试：node --test → 13/13（新增护栏 3 例：条目限额/TTL/unknown、泄漏检测、SSE 服务）。
