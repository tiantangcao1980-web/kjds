/**
 * Build one DSH plugin package from a SeaLeap skill repository.
 *
 * Usage: node scripts/pack.mjs <amazon|ecommerce>
 *
 * Copies the repository's content root into the package's `skills/` tree
 * (preserving every relative link), derives `lib/catalog.js`, and writes the
 * bundle manifest, cordis patch, plugin entry, README and legal files.
 */
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, '..');
const REPO = join(SOURCE, '..');

/** Upstream skill clones (see README) and the local DSH plugin directory. */
const RESEARCH_DIR = process.env.KJDS_RESEARCH_DIR ?? join(REPO, 'research');
const PLUGINS_DIR = process.env.DSH_PLUGINS_DIR ?? join(homedir(), 'dsh-plugins');

const SPECS = {
  amazon: {
    packageName: '@local/sealeap-amazon-skills',
    outDir: join(PLUGINS_DIR, 'sealeap-amazon-skills'),
    sourceRoot: join(RESEARCH_DIR, 'sealeap-amazon-skills', 'amazon-skills'),
    repoRoot: join(RESEARCH_DIR, 'sealeap-amazon-skills'),
    legalFiles: [
      ['LICENSE', 'LICENSE'],
      ['NOTICE', 'NOTICE'],
    ],
    expectedSkills: 602,
    providerName: 'sealeap-amazon-skills',
    skillName: 'sealeap-amazon-knowledge',
    toolName: 'sealeap_amazon',
    displayName: 'SeaLeap 亚马逊技能库',
    collection: 'amazon',
    catalogJson: null,
    excludeAtRoot: [],
    audience: '亚马逊（Amazon）站内运营：选品、Listing、广告、关键词、库存、FBA、合规、申诉、税务、利润、多站点',
    exclusion: '仅用于亚马逊站内问题；其他平台（Shopify、Ozon、Walmart、eBay、Etsy 等）请用跨平台电商技能库',
    scopeUnit: '来源',
    priority: ['amazon-official', 'public-research'],
    labels: {
      douyin: '抖音',
      weixin: '微信',
      app: 'App/工具',
      bilibili: '哔哩哔哩',
      youtube: 'YouTube',
      'amazon-official': '亚马逊官方',
      'public-research': '公开研究',
      xiaohongshu: '小红书',
    },
  },
  ecommerce: {
    packageName: '@local/sealeap-ecommerce-skills',
    outDir: join(PLUGINS_DIR, 'sealeap-ecommerce-skills'),
    sourceRoot: join(RESEARCH_DIR, 'sealeap-ecommerce-skills', 'sealeap-amazon-skills'),
    repoRoot: join(RESEARCH_DIR, 'sealeap-ecommerce-skills'),
    legalFiles: [
      ['LICENSE', 'LICENSE'],
      ['NOTICE', 'NOTICE'],
      ['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md'],
    ],
    expectedSkills: 195,
    expectedSkillsWithExtras: 196,
    extrasRoot: join(SOURCE, 'extras', 'ecommerce'),
    providerName: 'sealeap-ecommerce-skills',
    skillName: 'sealeap-ecommerce-knowledge',
    toolName: 'sealeap_ecommerce',
    displayName: 'SeaLeap 跨平台电商技能库',
    collection: 'ecommerce',
    catalogJson: 'assets/catalog.json',
    excludeAtRoot: [
      /^RESEARCH.*\.md$/,
      /^VALIDATION\.md$/,
      /^MERGE_MAP\.md$/,
      /^validate_.*\.py$/,
      /^test_.*\.py$/,
      /^\.gitignore$/,
    ],
    audience: '亚马逊以外的跨境平台运营：Shopify、Ozon、Mercado Libre、Walmart、Wayfair、eBay、Etsy、TikTok Shop 的选品、Listing、广告、库存、合规、本地化、利润',
    exclusion: '亚马逊站内问题请优先用亚马逊技能库',
    scopeUnit: '平台',
    labels: {
      shopify: 'Shopify',
      ozon: 'Ozon',
      mercadolibre: 'Mercado Libre',
      walmart: 'Walmart',
      wayfair: 'Wayfair',
      ebay: 'eBay',
      etsy: 'Etsy',
      tiktokshop: 'TikTok Shop',
    },
  },
};

/** Recursively list files under a directory. */
async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Parse the two frontmatter fields the catalog needs. */
function parseFrontmatter(raw) {
  const match = raw.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/);
  const header = match ? match[1] : '';
  const read = (key) => {
    const line = header.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
    if (!line) return '';
    let value = line[1].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1).replace(/''/g, "'");
    return value;
  };
  return { name: read('name'), description: read('description'), body: stripHeader(raw, match) };
}

function stripHeader(raw, match) {
  return match ? raw.slice(match[0].length) : raw;
}

/** First Markdown H1 in a body, or ''. */
function firstHeading(body) {
  const line = body.split(/\r?\n/).find((item) => /^#\s+\S/.test(item));
  return line ? line.replace(/^#\s+/, '').trim() : '';
}

/** Read `interface.display_name` / `interface.short_description` from an OpenAI-style yaml. */
async function readInterfaceYaml(file) {
  try {
    const raw = await readFile(file, 'utf8');
    const pick = (key) => {
      const line = raw.match(new RegExp(`^\\s*${key}:\\s*(.*)$`, 'm'));
      if (!line) return '';
      return line[1].trim().replace(/^["']/, '').replace(/["']$/, '');
    };
    return { displayName: pick('display_name'), shortDescription: pick('short_description') };
  } catch {
    return { displayName: '', shortDescription: '' };
  }
}

/** Build the catalog entries for one spec. */
async function buildEntries(spec, skillsRoot) {
  const files = (await walk(skillsRoot)).filter((file) => file.endsWith('SKILL.md'));
  const modeByName = new Map();
  if (spec.catalogJson) {
    const raw = JSON.parse(await readFile(join(skillsRoot, spec.catalogJson), 'utf8'));
    for (const entry of raw.skills ?? []) if (entry.name) modeByName.set(entry.name, entry.mode ?? null);
  }

  const entries = [];
  const names = new Set();
  for (const file of files) {
    const raw = await readFile(file, 'utf8');
    const { name, description, body } = parseFrontmatter(raw);
    if (!name) throw new Error(`SKILL.md without name: ${file}`);
    if (names.has(name)) throw new Error(`duplicate skill name: ${name}`);
    names.add(name);

    const skillDir = dirname(file);
    const relDir = relative(skillsRoot, skillDir).split('\\').join('/');
    const categoryPath = relDir.split('/').slice(0, -1);
    const interfaceMeta = await readInterfaceYaml(join(skillDir, 'agents', 'openai.yaml'));
    const siblings = await readdir(skillDir, { withFileTypes: true });
    entries.push({
      name,
      title: firstHeading(body) || interfaceMeta.displayName || name,
      displayName: interfaceMeta.displayName || '',
      description,
      shortDescription: interfaceMeta.shortDescription || '',
      categoryPath,
      dir: relDir,
      mode: modeByName.get(name) ?? null,
      hasReferences: siblings.some((entry) => entry.isDirectory() && entry.name === 'references'),
      hasScripts: siblings.some((entry) => entry.isDirectory() && entry.name === 'scripts'),
    });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

/** Copy the content root, dropping repository-root dev artifacts in place. */
async function copySkillTree(spec, skillsRoot) {
  await cp(spec.sourceRoot, skillsRoot, { recursive: true });
  for (const pattern of spec.excludeAtRoot) {
    for (const entry of await readdir(skillsRoot, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (pattern.test(entry.name)) await rm(join(skillsRoot, entry.name), { force: true });
    }
  }
}

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0ea5e9"/><path d="M14 40c6-14 12-21 18-21s12 7 18 21c-6-6-12-9-18-9s-12 3-18 9z" fill="#fff" opacity=".95"/><circle cx="32" cy="22" r="3.5" fill="#fff"/></svg>\n`;

/** Scope line shown in the entry skill description, derived from the catalog. */
function scopeOf(spec, entries) {
  const counts = new Map();
  for (const entry of entries) {
    const top = entry.categoryPath[0];
    if (top) counts.set(top, (counts.get(top) ?? 0) + 1);
  }
  const priority = spec.priority ?? [];
  const ordered = [...counts.entries()]
    .sort((a, b) => {
      const left = priority.indexOf(a[0]);
      const right = priority.indexOf(b[0]);
      if (left !== right) return (left < 0 ? priority.length : left) - (right < 0 ? priority.length : right);
      return b[1] - a[1];
    })
    .map(([name]) => spec.labels[name] ?? name);
  return spec.scopeUnit === '来源'
    ? `${ordered.join('、')}（${ordered.length} 类来源）`
    : `${ordered.join('、')}（${ordered.length} 个平台）`;
}

/** Write the generated plugin package. */
async function main() {
  const key = process.argv[2];
  const spec = SPECS[key];
  if (!spec) throw new Error(`usage: node scripts/pack.mjs <${Object.keys(SPECS).join('|')}>`);

  const skillsRoot = join(spec.outDir, 'skills');
  await rm(skillsRoot, { recursive: true, force: true });
  await mkdir(spec.outDir, { recursive: true });
  await mkdir(join(spec.outDir, 'lib'), { recursive: true });
  await copySkillTree(spec, skillsRoot);
  // Extra, locally maintained skills (for example the OZON API reference) are
  // merged on top of the upstream content tree so the clone stays untouched.
  const extrasRoot = spec.extrasRoot && existsSync(spec.extrasRoot) ? spec.extrasRoot : null;
  if (extrasRoot) {
    await cp(extrasRoot, skillsRoot, { recursive: true, force: true });
  } else if (spec.extrasRoot) {
    console.warn(`${key}: extras 目录不存在（${spec.extrasRoot}），按上游内容打包`);
  }

  const expectedSkills = extrasRoot ? (spec.expectedSkillsWithExtras ?? spec.expectedSkills) : spec.expectedSkills;
  const entries = await buildEntries(spec, skillsRoot);
  if (entries.length !== expectedSkills) {
    throw new Error(`${key}: expected ${expectedSkills} skills, found ${entries.length}`);
  }
  if (entries.some((entry) => !entry.description)) {
    throw new Error(`${key}: a skill is missing its description`);
  }

  for (const [from, to] of spec.legalFiles) {
    await cp(join(spec.repoRoot, from), join(spec.outDir, to));
  }

  const generated = [
    '// Generated by scripts/pack.mjs — do not edit by hand.',
    `export const GENERATED_AT = ${JSON.stringify(new Date().toISOString())};`,
    'export const CATALOG = [',
    ...entries.map((entry) => `${JSON.stringify(entry)},`),
    '];',
    '',
  ].join('\n');
  await writeFile(join(spec.outDir, 'lib', 'catalog.js'), generated, 'utf8');

  const config = [
    '// Generated by scripts/pack.mjs — do not edit by hand.',
    `export const CONFIG = ${JSON.stringify(
      {
        packageName: spec.packageName,
        providerName: spec.providerName,
        skillName: spec.skillName,
        toolName: spec.toolName,
        displayName: spec.displayName,
        collection: spec.collection,
        skillCount: entries.length,
        scope: scopeOf(spec, entries),
        audience: spec.audience,
        exclusion: spec.exclusion ?? null,
      },
      null,
      2,
    )};`,
    '',
  ].join('\n');
  await writeFile(join(spec.outDir, 'lib', 'config.js'), config, 'utf8');

  const packageJson = {
    name: spec.packageName,
    version: '1.0.0',
    private: true,
    type: 'module',
    description: `${spec.displayName}：${entries.length} 个技能，按需检索与读取（DeepSeek Harness 插件）。`,
    main: 'index.js',
    exports: { '.': './index.js' },
    files: ['index.js', 'lib', 'skills', 'cordis.patch.yml', 'README.md', 'LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md', 'icon.svg'],
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  };
  await writeFile(join(spec.outDir, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
  await writeFile(
    join(spec.outDir, 'cordis.patch.yml'),
    `- insert:\n    - id: ${spec.providerName}\n      name: '${spec.packageName}'\n`,
    'utf8',
  );
  await writeFile(join(spec.outDir, 'icon.svg'), ICON, 'utf8');

  await cp(join(SOURCE, 'index.js'), join(spec.outDir, 'index.js'));
  for (const file of ['text.js', 'search.js', 'read.js']) {
    await cp(join(SOURCE, 'lib', file), join(spec.outDir, 'lib', file));
  }
  await cp(join(SOURCE, 'test'), join(spec.outDir, 'test'), { recursive: true });
  await writeFile(join(spec.outDir, 'README.md'), readme(spec, entries), 'utf8');

  console.log(JSON.stringify({ ok: true, key, outDir: spec.outDir, skills: entries.length, categories: [...new Set(entries.flatMap((entry) => entry.categoryPath))].length }));
}

/** Render the package README. */
function readme(spec, entries) {
  const categories = [...new Set(entries.map((entry) => entry.categoryPath[0]))].sort();
  return `# ${spec.displayName} · DSH 插件

把 ${spec.sourceRoot} 里的 **${entries.length} 个技能** 打包成 DeepSeek Harness 插件：
只向会话技能目录增加 1 条入口技能 \`${spec.skillName}\`，其余技能通过 \`${spec.toolName}\` 工具按需检索与读取，完整保留
\`SKILL.md\`、\`references/\`、\`scripts/\`、\`agents/\` 与相对链接。

## 安装

插件源目录固定为 \`${spec.outDir}\`，通过 DSH 插件管理器安装（写绝对路径即可，profile 会记录为 \`link:\`）：

在 DeepSeek Harness 里让 Agent 调用 \`plugin_manager\`：

- \`action: "install_bundle"\`, \`target: "${spec.outDir}"\`

或者手动：在 profile 的 \`package.json\` 里加 \`"${spec.packageName}": "link:${spec.outDir}"\`，
并把 \`${spec.packageName}\` 追加到 \`dsh.profile.bundles\`，然后重新安装 profile 依赖。

## 使用

安装后（本地插件热加载，无需重启）：

- 技能目录出现 \`${spec.skillName}\`；
- 工具 \`${spec.toolName}\` 可用：

| action | 参数 | 作用 |
|---|---|---|
| \`search\` | \`query\`、可选 \`category\`、\`limit\` | 检索技能（中文口语整句、中英同义词均可），返回名称/标题/分类/描述 |
| \`list\` | 可选 \`category\` | 不带参数列分类与计数；带 \`category\` 下钻到该分类的技能清单（最多 60 条） |
| \`read\` | \`name\` | 读技能正文 + 同级文件清单 |
| \`file\` | \`name\`、\`file\` | 读技能内 references/scripts 文本（≤2 MB 读取，超过 40000 字符截断，禁越界） |

分类（${categories.length} 个一级分类）：${categories.join('、')}。

## 数据与许可

- 内容来自 ${spec.repoRoot}，构建时间 ${new Date().toISOString()}，共 ${entries.length} 个技能。
- 许可：MIT（SeaLeap）。随包保留 \`LICENSE\`、\`NOTICE\`${spec.legalFiles.some(([from]) => from === 'THIRD_PARTY_NOTICES.md') ? '、`THIRD_PARTY_NOTICES.md`' : ''} 以及每个技能目录内自带的 LICENSE/NOTICE。
- 商标与第三方内容的权利归各权利人；本包不重新许可这些内容。

## 重新构建

\`\`\`bash
node ${join(SOURCE, 'scripts', 'pack.mjs')} ${spec.collection}
\`\`\`
`;
}


await main();
