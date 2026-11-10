/**
 * Weekly API change watcher for the ecommerce / Amazon plugin libraries.
 *
 * For every platform it fetches the configured doc / spec sources, derives a
 * compact fingerprint, compares it with the stored baseline and writes a
 * Markdown report. Where a platform has a local generator (Ozon), a detected
 * change can be published end-to-end (regenerate endpoint files, repack,
 * run the package tests). Platforms without a local generator only get a
 * staged snapshot plus a review note.
 *
 * Usage:
 *   node scripts/watch-apis.mjs                      # all platforms, report only
 *   node scripts/watch-apis.mjs --platform ozon      # one platform
 *   node scripts/watch-apis.mjs --platform all --publish   # apply Ozon updates
 *   node scripts/watch-apis.mjs --init               # seed baseline, no report
 *   node scripts/watch-apis.mjs --dry-run            # write nothing
 *
 * Exit code: 0 = ran (changed or not), 1 = at least one source unreachable,
 *            2 = a platform error stopped an auto-update.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, '..');
const REPO = join(SOURCE, '..');
const RESEARCH_DIR = process.env.KJDS_RESEARCH_DIR ?? join(REPO, 'research');
const PLUGINS_DIR = process.env.DSH_PLUGINS_DIR ?? join(homedir(), 'dsh-plugins');
const WATCH_DIR = join(REPO, 'docs', 'api-watch');
const STATE_PATH = join(WATCH_DIR, 'state.json');
const REPORT_DIR = join(WATCH_DIR, 'reports');
const SNAPSHOT_DIR = join(WATCH_DIR, 'snapshots');
const STAGED_DIR = join(WATCH_DIR, 'staged');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 30_000;

const OZON_MIRROR = 'https://raw.githubusercontent.com/MissiaL/ozon-api/main/references';
const ECOMMERCE_PKG = join(PLUGINS_DIR, 'sealeap-ecommerce-skills');

const PLATFORMS = [
  {
    key: 'ozon',
    name: 'Ozon',
    library: 'ecommerce',
    skill: 'sealeap-ozon-seller-api',
    mode: 'publish',
    note: '官方 docs.ozon.ru 有反爬挑战，端点清单来自开源镜像里的官方 OpenAPI 快照。',
    sources: [
      { id: 'seller-spec', kind: 'json', url: `${OZON_MIRROR}/ozon-seller-openapi.json`, file: 'research/ozon-api/ozon-seller-openapi.json' },
      { id: 'performance-spec', kind: 'json', url: `${OZON_MIRROR}/ozon-performance-openapi.json`, file: 'research/ozon-api/ozon-performance-openapi.json' },
      { id: 'mirror-commit', kind: 'git-head', repo: 'https://github.com/MissiaL/ozon-api' },
      { id: 'official-docs', kind: 'html', url: 'https://docs.ozon.ru/api/seller/', required: false },
    ],
  },
  {
    key: 'amazon',
    name: 'Amazon SP-API',
    library: 'amazon',
    skill: '(尚无 SP-API 技能)',
    mode: 'stage',
    note: '官方模型仓库每次发布都会更新；目前只暂存模型清单，未生成技能端点文件。',
    sources: [
      { id: 'models-repo', kind: 'git-head', repo: 'https://github.com/amzn/selling-partner-api-models' },
      {
        id: 'models-dir',
        kind: 'gh-tree',
        repo: 'https://github.com/amzn/selling-partner-api-models',
        path: 'models',
        keep: /-model$/,
      },
    ],
  },
  {
    key: 'shopify',
    name: 'Shopify Admin API',
    library: 'ecommerce',
    skill: 'shopify 平台技能（28 个）',
    mode: 'track',
    note: '没有可信的机器可读 spec（官方 GraphQL schema 需授权），跟踪文档版本标识。',
    sources: [
      { id: 'admin-rest-docs', kind: 'html', url: 'https://shopify.dev/docs/api/admin-rest' },
      { id: 'release-notes', kind: 'html', url: 'https://shopify.dev/docs/api/release-notes' },
    ],
  },
  {
    key: 'walmart',
    name: 'Walmart Marketplace API',
    library: 'ecommerce',
    skill: 'walmart 平台技能（24 个）',
    mode: 'track',
    note: '文档站无公开 spec，跟踪页面版本标识。',
    sources: [{ id: 'developer-docs', kind: 'html', url: 'https://developer.walmart.com/' }],
  },
  {
    key: 'ebay',
    name: 'eBay Sell API',
    library: 'ecommerce',
    skill: 'ebay 平台技能（23 个）',
    mode: 'track',
    note: '官方文档站未提供公开机器可读 spec，改用维护中的 OAS3 镜像仓库跟踪端点文件变化；同时跟踪一个官方概览页。',
    sources: [
      {
        id: 'oas-specs-mirror',
        kind: 'gh-tree',
        repo: 'https://github.com/hendt/ebay-api',
        path: 'specs',
        keep: /\.json$/,
      },
      { id: 'mirror-commit', kind: 'git-head', repo: 'https://github.com/hendt/ebay-api' },
      { id: 'official-overview', kind: 'html', url: 'https://developer.ebay.com/api-docs/sell/inventory/overview.html', required: false },
    ],
  },
  {
    key: 'etsy',
    name: 'Etsy Open API v3',
    library: 'ecommerce',
    skill: 'etsy 平台技能（23 个）',
    mode: 'track',
    note: 'etsy.com 常因网络环境在 TLS 层即失败，改用镜像仓库里的 3.0.0 spec 跟踪；官方文档页作为可选来源。',
    sources: [
      { id: 'spec-mirror', kind: 'json', url: 'https://raw.githubusercontent.com/gearment/go-etsy/master/etsy_3.0.0.json' },
      { id: 'mirror-commit', kind: 'git-head', repo: 'https://github.com/gearment/go-etsy' },
      { id: 'official-docs', kind: 'html', url: 'https://developers.etsy.com/documentation/reference/', required: false },
    ],
  },
  {
    key: 'tiktokshop',
    name: 'TikTok Shop Partner API',
    library: 'ecommerce',
    skill: 'tiktokshop 平台技能（22 个）',
    mode: 'track',
    note: '文档站为前端渲染，跟踪页面版本标识。',
    sources: [{ id: 'docv2', kind: 'html', url: 'https://partner.tiktokshop.com/docv2' }],
  },
  {
    key: 'mercadolibre',
    name: 'Mercado Libre API',
    library: 'ecommerce',
    skill: 'mercadolibre 平台技能（25 个）',
    mode: 'track',
    note: '无公开 spec，跟踪开发者站版本标识。',
    sources: [{ id: 'developers', kind: 'html', url: 'https://developers.mercadolibre.com/' }],
  },
  {
    key: 'wayfair',
    name: 'Wayfair API',
    library: 'ecommerce',
    skill: 'wayfair 平台技能（24 个）',
    mode: 'track',
    note: '开发者站较小，跟踪页面版本标识。',
    sources: [{ id: 'developers', kind: 'html', url: 'https://developer.wayfair.com/' }],
  },
];

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : (args[index + 1] ?? fallback);
};

const publish = flag('publish');
const init = flag('init');
const dryRun = flag('dry-run');
const platformFilter = option('platform', 'all');

function log(message) {
  console.log(message);
}

function today() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

async function fetchBytes(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'user-agent': UA, accept: '*/*', 'accept-language': 'en-US,en;q=0.9,zh-CN;q=0.8' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length > MAX_BYTES) throw new Error(`response too large (${buffer.length} B)`);
      return buffer;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function sha(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function versionTokens(text) {
  const tokens = new Set();
  for (const match of text.matchAll(/\b(20\d\d[-.]\d{2})\b/g)) tokens.add(match[1]);
  for (const match of text.matchAll(/\bv(\d+(?:\.\d+){0,3})\b/g)) {
    if (match[1].length <= 8) tokens.add(`v${match[1]}`);
  }
  return [...tokens].sort().slice(0, 24);
}

function pageTitle(html) {
  return (html.match(/<title[^>]*>([^<]{0,120})<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim();
}

function jsonFingerprint(buffer) {
  const spec = JSON.parse(buffer.toString('utf8'));
  const paths = spec.paths ?? {};
  const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
  let operations = 0;
  const tags = new Set();
  for (const item of Object.values(paths)) {
    for (const method of methods) {
      if (item?.[method]) {
        operations += 1;
        for (const tag of item[method].tags ?? []) tags.add(tag);
      }
    }
  }
  return {
    kind: 'json',
    bytes: buffer.length,
    sha256: sha(buffer).slice(0, 16),
    pathCount: Object.keys(paths).length,
    operationCount: operations,
    tagCount: tags.size,
    openapi: spec.openapi ?? spec.swagger ?? null,
    title: String(spec.info?.title ?? '').slice(0, 80),
  };
}

/**
 * GitHub's REST API is rate limited to 60 anonymous requests per hour, which is
 * far too tight for nine weekly checks plus manual runs. `git ls-remote` and the
 * public HTML tree pages are unmetered, so both are used instead of api.github.com.
 */
function gitLsRemote(repo) {
  const output = execFileSync('git', ['ls-remote', '--symref', repo, 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000,
  });
  const shaLine = output.split('\n').find((line) => /\bHEAD$/.test(line));
  if (!shaLine) throw new Error(`git ls-remote returned no HEAD for ${repo}`);
  const branch = output.match(/^ref: refs\/heads\/(\S+)\tHEAD$/m)?.[1] ?? 'main';
  return { sha: shaLine.split('\t')[0].slice(0, 12), branch };
}

function repoSlug(repo) {
  const match = repo.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!match) throw new Error(`unsupported repo url ${repo}`);
  return `${match[1]}/${match[2]}`;
}

function treeNames(html, source, branch) {
  const raw = [...html.matchAll(/"name":"([^"]+)"/g)].map((match) => match[1]);
  const names = raw.filter((name) => {
    if (name.includes('/')) return false;
    if (name === branch || name === 'main' || name === 'master') return false;
    return source.keep ? source.keep.test(name) : true;
  });
  return [...new Set(names)].sort();
}

function treeFingerprint(names) {
  return { kind: 'gh-tree', count: names.length, names };
}

async function observeGitHead(source) {
  const { sha } = gitLsRemote(source.repo);
  return { buffer: Buffer.from(`${source.repo}@${sha}\n`), fingerprint: { kind: 'git-head', sha } };
}

async function observeTree(source) {
  const { branch } = gitLsRemote(source.repo);
  const url = `https://github.com/${repoSlug(source.repo)}/tree/${branch}/${source.path}`;
  const buffer = await fetchBytes(url);
  const names = treeNames(buffer.toString('utf8'), source, branch);
  if (names.length === 0) throw new Error(`no entries parsed from ${url}`);
  return { buffer, fingerprint: treeFingerprint(names) };
}

function htmlFingerprint(buffer) {
  const html = buffer.toString('utf8');
  const versions = versionTokens(html);
  return {
    kind: 'html',
    title: pageTitle(html),
    versions,
    // Content length is noisy (marketing blocks rotate), so it only qualifies
    // the signal; a change is reported only when versions or the title change.
    bytesBucket: Math.round(buffer.length / 50_000),
  };
}

function describe(fingerprint) {
  if (!fingerprint) return '（首次记录）';
  switch (fingerprint.kind) {
    case 'json':
      return `${fingerprint.pathCount} paths / ${fingerprint.operationCount} ops / ${fingerprint.tagCount} tags · sha ${fingerprint.sha256}`;
    case 'git-head':
      return `HEAD 提交 ${fingerprint.sha}`;
    case 'gh-tree':
      return `${fingerprint.count} 项（${fingerprint.names.slice(0, 6).join('、')}${fingerprint.count > 6 ? ' …' : ''}）`;
    case 'html':
      return `版本标识 ${fingerprint.versions.length ? fingerprint.versions.join(', ') : '（无）'} · 标题「${fingerprint.title}」`;
    default:
      return JSON.stringify(fingerprint);
  }
}

function changed(before, after) {
  if (!before) return { changed: true, reasons: ['首次记录'] };
  if (!after) return { changed: false, reasons: [] };
  const reasons = [];
  if (before.kind !== after.kind) {
    reasons.push(`来源类型变化：${before.kind} → ${after.kind}`);
    return { changed: true, reasons };
  }
  switch (after.kind) {
    case 'json':
      if (before.pathCount !== after.pathCount) reasons.push(`路径数 ${before.pathCount} → ${after.pathCount}`);
      if (before.operationCount !== after.operationCount) reasons.push(`操作数 ${before.operationCount} → ${after.operationCount}`);
      if (before.tagCount !== after.tagCount) reasons.push(`tag 数 ${before.tagCount} → ${after.tagCount}`);
      if (before.sha256 !== after.sha256 && reasons.length === 0) reasons.push(`内容哈希 ${before.sha256} → ${after.sha256}`);
      break;
    case 'git-head':
      if (before.sha !== after.sha) reasons.push(`HEAD 提交 ${before.sha} → ${after.sha}`);
      break;
    case 'gh-tree': {
      const added = after.names.filter((name) => !before.names.includes(name));
      const removed = before.names.filter((name) => !after.names.includes(name));
      if (added.length) reasons.push(`新增：${added.join('、')}`);
      if (removed.length) reasons.push(`移除：${removed.join('、')}`);
      break;
    }
    case 'html': {
      const added = after.versions.filter((version) => !before.versions.includes(version));
      const removed = before.versions.filter((version) => !after.versions.includes(version));
      if (added.length) reasons.push(`新增版本标识：${added.join('、')}`);
      if (removed.length) reasons.push(`消失的版本标识：${removed.join('、')}`);
      if (!before.title && after.title) reasons.push(`页面标题出现：${after.title}`);
      break;
    }
    default:
      break;
  }
  return { changed: reasons.length > 0, reasons };
}

async function observe(source) {
  switch (source.kind) {
    case 'git-head':
      return observeGitHead(source);
    case 'gh-tree':
      return observeTree(source);
    default:
      break;
  }
  const buffer = await fetchBytes(source.url);
  let fingerprint;
  switch (source.kind) {
    case 'json':
      fingerprint = jsonFingerprint(buffer);
      break;
    case 'html':
      fingerprint = htmlFingerprint(buffer);
      break;
    default:
      throw new Error(`unknown source kind ${source.kind}`);
  }
  return { buffer, fingerprint };
}

function runNode(scriptRelative, options = {}) {
  const output = execFileSync(process.execPath, [join(SOURCE, 'scripts', scriptRelative), ...(options.args ?? [])], {
    cwd: options.cwd ?? SOURCE,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return output.trim();
}

async function refreshOzonSourceDoc(seller, performance) {
  const sourcePath = join(SOURCE, 'extras', 'ecommerce', 'ozon', 'sealeap-ozon-seller-api', 'references', 'source.md');
  if (!existsSync(sourcePath)) return;
  const sellerFp = jsonFingerprint(seller);
  const performanceFp = jsonFingerprint(performance);
  const markdown = await readFile(sourcePath, 'utf8');
  const next = markdown
    .replace(/快照抓取日期：\*\*\d{4}-\d{2}-\d{2}\*\*/, `快照抓取日期：**${today()}**`)
    .replace(
      /Seller `paths: \d+`、Performance `paths: \d+ \/ operations: \d+`/,
      `Seller \`paths: ${sellerFp.pathCount}\`、Performance \`paths: ${performanceFp.pathCount} / operations: ${performanceFp.operationCount}\``,
    );
  if (next !== markdown) await writeFile(sourcePath, next, 'utf8');
}

async function publishOzon(state, snapshot) {
  await mkdir(join(RESEARCH_DIR, 'ozon-api'), { recursive: true });
  const sellerPath = join(RESEARCH_DIR, 'ozon-api', 'ozon-seller-openapi.json');
  const performancePath = join(RESEARCH_DIR, 'ozon-api', 'ozon-performance-openapi.json');
  await writeFile(sellerPath, snapshot.seller);
  await writeFile(performancePath, snapshot.performance);

  const buildScript = join(SOURCE, 'scripts', 'build-ozon-api.mjs');
  const buildSource = await readFile(buildScript, 'utf8');
  await writeFile(buildScript, buildSource.replace(/const SNAPSHOT_DATE = '[^']*';/, `const SNAPSHOT_DATE = '${today()}';`), 'utf8');

  const buildOutput = runNode('build-ozon-api.mjs');
  await refreshOzonSourceDoc(snapshot.seller, snapshot.performance);
  const packOutput = runNode('pack.mjs', { args: ['ecommerce'] });
  let testSummary = '';
  try {
    const testOutput = execFileSync(process.execPath, ['--test'], {
      cwd: ECOMMERCE_PKG,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,
    });
    testSummary = summarizeTests(testOutput);
  } catch (error) {
    testSummary = summarizeTests(`${error.stdout ?? ''}\n${error.stderr ?? ''}`) || '测试失败（无输出）';
    throw Object.assign(new Error(`packed package tests failed: ${testSummary}`), { published: true, buildOutput, packOutput });
  }
  return { buildOutput, packOutput, testSummary };
}

function summarizeTests(output) {
  const pick = (label) => output.match(new RegExp(`# ${label} (\\d+)`))?.[1];
  if (!pick('tests')) return '';
  return `tests ${pick('tests')} / pass ${pick('pass')} / fail ${pick('fail')}`;
}

async function stageAmazon(snapshot) {
  await mkdir(STAGED_DIR, { recursive: true });
  const dirs = snapshot.dirs;
  const body = [
    `# Amazon SP-API 模型清单（暂存）`,
    '',
    `抓取时间：${new Date().toISOString()}`,
    `模型目录数：${dirs.length}`,
    '',
    '> 该文件由 scripts/watch-apis.mjs 自动生成，仅用于变更对照。',
    '> 尚未生成技能端点文件；如需发布，需要先接入 SP-API 的 OpenAPI 模型生成器。',
    '',
    ...dirs.map((dir) => `- ${dir}`),
    '',
  ].join('\n');
  await writeFile(join(STAGED_DIR, 'amazon-spapi-models.md'), body, 'utf8');
  return `已暂存 ${dirs.length} 个模型目录到 docs/api-watch/staged/amazon-spapi-models.md`;
}

async function main() {
  const platforms = platformFilter === 'all' ? PLATFORMS : PLATFORMS.filter((item) => item.key === platformFilter);
  if (platforms.length === 0) {
    console.error(`unknown platform: ${platformFilter} (known: ${PLATFORMS.map((item) => item.key).join(', ')}, all)`);
    process.exit(1);
  }

  await mkdir(REPORT_DIR, { recursive: true });
  await mkdir(SNAPSHOT_DIR, { recursive: true });

  const state = existsSync(STATE_PATH) ? JSON.parse(await readFile(STATE_PATH, 'utf8')) : {};
  const date = today();
  let unreachable = 0;
  let failed = 0;
  const reportFiles = [];

  for (const platform of platforms) {
    const entries = [];
    const changes = [];
    const snapshots = {};

    for (const source of platform.sources) {
      try {
        const { buffer, fingerprint } = await observe(source);
        snapshots[source.id] = { buffer, fingerprint };
        const before = state[platform.key]?.[source.id];
        const diff = init ? { changed: false, reasons: [] } : changed(before?.fingerprint, fingerprint);
        if (diff.changed && !init) changes.push({ source, reasons: diff.reasons });
        entries.push({ source, status: 'ok', fingerprint, before: before?.fingerprint, diff });
      } catch (error) {
        const optional = source.required === false;
        if (!optional) unreachable += 1;
        entries.push({ source, status: optional ? 'skipped' : 'error', error: error.message, optional });
      }
    }

    let action = '无（未变化）';
    const requiredErrors = entries.filter((entry) => entry.status === 'error' && !entry.optional);
    if (init) {
      action = '初始化基线';
    } else if (changes.length > 0) {
      if (platform.mode === 'publish' && publish) {
        try {
          const seller = snapshots['seller-spec']?.buffer;
          const performance = snapshots['performance-spec']?.buffer;
          if (!seller || !performance) throw new Error('缺少 Seller/Performance spec，无法重新生成');
          const result = await publishOzon(state, { seller, performance });
          action = `已发布：${result.testSummary}；构建输出 ${result.buildOutput.split('\n').pop()}；打包 ${result.packOutput}`;
        } catch (error) {
          failed += 1;
          action = `发布失败：${error.message}`;
        }
      } else if (platform.mode === 'stage') {
        const dirs = snapshots['models-dir']?.fingerprint?.names;
        if (!dirs) action = '暂存跳过（模型目录未取到）';
        else if (dryRun) action = `将暂存 ${dirs.length} 个模型目录（dry-run，未写入）`;
        else action = await stageAmazon({ dirs });
      } else if (platform.mode === 'publish') {
        action = '检测到变化但未发布（加 --publish 才会重新生成并打包）';
      } else {
        action = '检测到变化，需人工核对文档并更新技能（该平台无本地生成器）';
      }
    } else if (requiredErrors.length > 0) {
      action = `部分来源不可达，无法判断变化（${requiredErrors.map((entry) => entry.source.id).join('、')}）`;
    }

    if (!dryRun) {
      state[platform.key] ??= {};
      for (const entry of entries) {
        if (entry.status !== 'ok') continue;
        state[platform.key][entry.source.id] = {
          fingerprint: entry.fingerprint,
          observedAt: new Date().toISOString(),
        };
      }
      if (changes.length > 0 && !init) {
        for (const change of changes) {
          state[platform.key][change.source.id].changedAt = new Date().toISOString();
        }
      }
      state[platform.key].lastRunAt = new Date().toISOString();
      state[platform.key].lastAction = action;
    }

    if (!init) {
      const reportPath = join(REPORT_DIR, `${date}-${platform.key}.md`);
      const lines = [
        `# ${platform.name} API 变更报告 · ${date}`,
        '',
        `- 平台键：\`${platform.key}\`（库：${platform.library}，技能：${platform.skill}）`,
        `- 结论：${changes.length > 0 ? `**检测到 ${changes.length} 处变化**` : entries.some((entry) => entry.status === 'error') ? '**部分来源不可达**' : '无变化'}`,
        `- 自动动作：${action}`,
        `- 说明：${platform.note}`,
        '',
        '## 来源状态',
        '',
        '| 来源 | 类型 | 状态 | 当前指纹 | 变化 |',
        '|---|---|---|---|---|',
        ...entries.map((entry) => {
          const status = entry.status === 'ok' ? '✅ 可达' : entry.status === 'skipped' ? '⏭️ 跳过（可选）' : `❌ ${entry.error}`;
          const current = entry.status === 'ok' ? describe(entry.fingerprint) : '—';
          const diff = entry.status === 'ok' && entry.diff.changed ? entry.diff.reasons.join('；') : '—';
          return `| \`${entry.source.id}\` | ${entry.source.kind} | ${status} | ${current} | ${diff} |`;
        }),
        '',
      ];
      if (changes.length > 0) {
        lines.push('## 变化详情', '');
        for (const change of changes) {
          lines.push(`### \`${change.source.id}\``, '', `- 之前：${describe(entries.find((entry) => entry.source.id === change.source.id)?.before)}`, `- 现在：${describe(entries.find((entry) => entry.source.id === change.source.id)?.fingerprint)}`);
          for (const reason of change.reasons) lines.push(`- ${reason}`);
          lines.push('');
        }
        lines.push(
          '## 建议动作',
          '',
          platform.mode === 'publish'
            ? '- 已配置生成器：加 `--publish` 重跑会重新生成端点清单、重打包并跑包内测试；发布后提醒用户重载插件。'
            : platform.mode === 'stage'
              ? '- 已暂存模型清单；如需在技能里发布端点清单，需要先接入该平台的 OpenAPI 模型生成器。'
              : '- 该平台没有本地生成器：对照官方 changelog 人工核对受影响端点，再更新对应平台技能。',
          '',
        );
      }
      if (!dryRun) {
        await writeFile(reportPath, lines.join('\n'), 'utf8');
        reportFiles.push(reportPath);
      }
      log(`${platform.key}: ${changes.length > 0 ? `${changes.length} change(s)` : 'no change'} → ${action}`);
    } else {
      log(`${platform.key}: baseline seeded (${entries.filter((entry) => entry.status === 'ok').length}/${platform.sources.length} sources)`);
    }
  }

  if (!dryRun) {
    await writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  }
  if (init) log(`baseline written to ${STATE_PATH}`);
  if (reportFiles.length) log(`reports: ${reportFiles.join(', ')}`);
  if (failed > 0) process.exit(2);
  if (unreachable > 0) process.exit(1);
}

await main();
