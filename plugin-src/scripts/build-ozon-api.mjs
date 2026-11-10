/**
 * Build the OZON API reference files for the sealeap-ecommerce-skills package.
 *
 * Reads the official OpenAPI snapshots kept under research/ozon-api/ and writes
 * per-domain endpoint lists into plugin-src/extras/, which scripts/pack.mjs
 * merges into the packaged skill tree.
 *
 * Usage: node scripts/build-ozon-api.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, '..');
const REPO = join(SOURCE, '..');
const RESEARCH_DIR = process.env.KJDS_RESEARCH_DIR ?? join(REPO, 'research');
const SNAP = join(RESEARCH_DIR, 'ozon-api');
const OUT_DIR = join(SOURCE, 'extras', 'ecommerce', 'ozon', 'sealeap-ozon-seller-api', 'references');

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const SNAPSHOT_DATE = '2026-11-06';

/** Business domains: file -> tags. Every tag must appear exactly once. */
const DOMAINS = [
  {
    file: 'endpoints-products.md',
    title: '商品、价格与库存',
    slug: 'products',
    tags: ['ProductAPI', 'CategoryAPI', 'BarcodeAPI', 'BrandAPI', 'Pass', 'Digital', 'CertificationAPI', 'Prices&StocksAPI', 'PricingStrategyAPI'],
  },
  {
    file: 'endpoints-fbs.md',
    title: 'FBS / rFBS 订单与配送',
    slug: 'fbs',
    tags: ['FBS', 'DeliveryFBS', 'DeliveryrFBS', 'FBS&rFBSMarks', 'CarriageAPI', 'CancellationAPI', 'CancelReasonAPI'],
  },
  {
    file: 'endpoints-fbo.md',
    title: 'FBO 供货与仓库',
    slug: 'fbo',
    tags: ['FboSupplyRequest', 'FBO', 'FboPostingAPI', 'FBOTransport', 'FBOWarehouse', 'FBSWarehouseSetup', 'rFBSWarehouseSetup', 'WarehouseAPI', 'PolygonAPI', 'SupplyOrderAPI', 'SupplierAPI'],
  },
  {
    file: 'endpoints-returns.md',
    title: '退货',
    slug: 'returns',
    tags: ['ReturnAPI', 'ReturnsAPI', 'RFBSReturnsAPI'],
  },
  {
    file: 'endpoints-promos.md',
    title: '促销与价格活动',
    slug: 'promos',
    tags: ['Promos', 'PromosBeta', 'SellerActions'],
  },
  {
    file: 'endpoints-reports.md',
    title: '报表、财务与评级',
    slug: 'reports',
    tags: ['ReportAPI', 'FinanceAPI', 'Receipt', 'AnalyticsAPI', 'Premium', 'SellerRating'],
  },
  {
    file: 'endpoints-engagement.md',
    title: '评价、问答、聊天与通知',
    slug: 'engagement',
    tags: ['ReviewAPI', 'Questions&Answers', 'ChatAPI', 'Notification'],
  },
  {
    file: 'endpoints-platform.md',
    title: '账号、平台能力与 Ozon 配送',
    slug: 'platform',
    tags: ['APIkey', 'SellerInfo', 'BetaMethod', 'DeliveryFBP', 'DeliveryFBPDraft', 'DraftDirectFBP', 'DraftDropOffFBP', 'DraftPickupFBP', 'OrderDirectFBP', 'OrderDropOffFBP', 'OrderPickupFBP', 'DeliveryAPI', 'OrderAPI'],
  },
];

/** Resolve one local component $ref, one level only. */
function deref(spec, schema) {
  if (!schema) return undefined;
  if (schema.$ref) {
    const match = /^#\/components\/schemas\/(.+)$/.exec(schema.$ref);
    if (match) return spec.components?.schemas?.[match[1]];
    return undefined;
  }
  return schema;
}

/** Collect every operation of a spec with the facts the reference needs. */
function collectOperations(spec) {
  const operations = [];
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const method of METHODS) {
      const op = item[method];
      if (!op) continue;
      const body = deref(spec, op.requestBody?.content?.['application/json']?.schema ?? op.requestBody?.content?.['*/*']?.schema);
      operations.push({
        method: method.toUpperCase(),
        path,
        tag: (op.tags ?? ['(untagged)'])[0],
        summary: (op.summary ?? '').replace(/\s+/g, ' ').trim(),
        deprecated: Boolean(op.deprecated),
        required: (body?.required ?? []).slice(),
      });
    }
  }
  return operations;
}

function sortOperations(a, b) {
  return a.path.localeCompare(b.path, 'en') || a.method.localeCompare(b.method);
}

function renderLine(op) {
  const required = op.required.length ? `【必填：${op.required.join('、')}】` : '';
  const deprecated = op.deprecated ? ' ⚠️已废弃' : '';
  return `- \`${op.method} ${op.path}\` — ${op.summary || '（无摘要）'}${required}${deprecated}\n`;
}

/** Render one domain file. */
function renderDomain(domain, operations, total) {
  const inDomain = operations.filter((op) => domain.tags.includes(op.tag)).sort(sortOperations);
  const byTag = new Map();
  for (const op of inDomain) {
    const list = byTag.get(op.tag) ?? [];
    list.push(op);
    byTag.set(op.tag, list);
  }
  const orderedTags = domain.tags.filter((tag) => byTag.has(tag));
  const counts = orderedTags.map((tag) => `${tag}（${byTag.get(tag).length}）`).join('、');
  const lines = [];
  lines.push(`# Ozon Seller API · ${domain.title}`);
  lines.push('');
  lines.push(`共 ${inDomain.length} 个端点（全部 ${total} 个中的一部分）。分组：${counts}。`);
  lines.push('');
  lines.push(`> 来源：Ozon 官方 OpenAPI 快照（\`docs.ozon.ru/api/seller\` 的 swagger.json，抓取 ${SNAPSHOT_DATE}）。`);
  lines.push('> 端点摘要是官方俄文原文；【必填】是请求体顶层必填字段；⚠️ 表示官方标记 deprecated。');
  lines.push('> 认证、限流、错误码见 `auth.md` 与 `conventions.md`；本文件小于 40000 字符，可用 `file` 一次读完。');
  lines.push('');
  for (const tag of orderedTags) {
    const ops = byTag.get(tag);
    lines.push(`## ${tag} · ${ops.length} 个端点`);
    lines.push('');
    for (const op of ops) lines.push(renderLine(op).trimEnd());
    lines.push('');
  }
  return lines.join('\n');
}

function renderPerformance(spec) {
  const operations = collectOperations(spec).sort(sortOperations);
  const byTag = new Map();
  for (const op of operations) {
    const list = byTag.get(op.tag) ?? [];
    list.push(op);
    byTag.set(op.tag, list);
  }
  const lines = [];
  lines.push('# Ozon Performance API · 端点清单');
  lines.push('');
  lines.push(`共 ${operations.length} 个端点。分组：${[...byTag.entries()].map(([tag, ops]) => `${tag}（${ops.length}）`).join('、')}。`);
  lines.push('');
  lines.push(`> 来源：Ozon 官方 OpenAPI 快照（\`docs.ozon.ru/api/seller\` 的 Performance swagger，抓取 ${SNAPSHOT_DATE}）。`);
  lines.push('> 主机与认证和 Seller API 不同，先读 `performance.md`。');
  lines.push('');
  for (const [tag, ops] of byTag) {
    lines.push(`## ${tag} · ${ops.length} 个端点`);
    lines.push('');
    for (const op of ops) lines.push(renderLine(op).trimEnd());
    lines.push('');
  }
  return lines.join('\n');
}

function renderIndex(domainStats, performanceBytes, sellerTotal, performanceTotal) {
  const rows = domainStats.map((item) => `| [${item.file}](${item.file}) | ${item.title} | ${item.count} | ${Buffer.byteLength(item.content)} |`);
  const lines = [];
  lines.push('# OZON API 参考文件索引');
  lines.push('');
  lines.push(`Seller API 共 ${sellerTotal} 个端点，按业务域拆成 ${domainStats.length} 个文件；另有 Performance API ${performanceTotal} 个端点。`);
  lines.push('');
  lines.push('| 文件 | 业务域 | 端点数 | 字节数 |');
  lines.push('|---|---|---:|---:|');
  lines.push(...rows);
  lines.push(`| [endpoints-performance.md](endpoints-performance.md) | 广告（Performance API） | ${performanceTotal} | ${performanceBytes} |`);
  lines.push('');
  lines.push('怎么选文件：按任务所属环节选 1 个域文件读完；跨域问题（如「查商品 → 改价 → 看订单」）逐段读对应域。');
  lines.push('');
  lines.push('其他文件：`auth.md`（两套认证）、`conventions.md`（通用约定/限流/错误码）、`performance.md`（广告 API 流程）、`source.md`（来源与边界）。');
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const seller = JSON.parse(await readFile(join(SNAP, 'ozon-seller-openapi.json'), 'utf8'));
  const performance = JSON.parse(await readFile(join(SNAP, 'ozon-performance-openapi.json'), 'utf8'));

  const sellerOps = collectOperations(seller);
  const performanceOps = collectOperations(performance);

  const knownTags = new Set(DOMAINS.flatMap((domain) => domain.tags));
  for (const op of sellerOps) {
    if (!knownTags.has(op.tag)) throw new Error(`tag not mapped to a domain file: ${op.tag} (${op.method} ${op.path})`);
  }

  await mkdir(OUT_DIR, { recursive: true });
  const domainStats = [];
  for (const domain of DOMAINS) {
    const content = renderDomain(domain, sellerOps, sellerOps.length);
    await writeFile(join(OUT_DIR, domain.file), content, 'utf8');
    domainStats.push({
      file: domain.file,
      title: domain.title,
      count: sellerOps.filter((op) => domain.tags.includes(op.tag)).length,
      content,
    });
  }

  const performanceContent = renderPerformance(performance);
  await writeFile(join(OUT_DIR, 'endpoints-performance.md'), performanceContent, 'utf8');

  const index = renderIndex(domainStats, Buffer.byteLength(performanceContent), sellerOps.length, performanceOps.length);
  await writeFile(join(OUT_DIR, 'index.md'), index, 'utf8');

  console.log(JSON.stringify({
    ok: true,
    sellerOps: sellerOps.length,
    performanceOps: performanceOps.length,
    files: domainStats.map((item) => ({ file: item.file, endpoints: item.count, bytes: Buffer.byteLength(item.content) })),
    performanceBytes: Buffer.byteLength(performanceContent),
    indexBytes: Buffer.byteLength(index),
  }, null, 2));
}

await main();
