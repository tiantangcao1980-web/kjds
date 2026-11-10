/**
 * SeaLeap skills plugin entry: one model-facing entry skill plus one tool that
 * searches, lists, reads, and opens files of every packaged SKILL.md bundle.
 *
 * @module sealeap-skills
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from './lib/config.js';
import { CATALOG } from './lib/catalog.js';
import { clampText, stripFrontmatter } from './lib/text.js';
import { searchEntries } from './lib/search.js';
import { readText, resolveInside } from './lib/read.js';

const SKILLS_ROOT = fileURLToPath(new URL('./skills/', import.meta.url));
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_FILE_CHARS = 40000;
const MAX_LISTED_FILES = 60;
const MAX_DRILLDOWN_SKILLS = 60;

const INVOCATION = { modelInvocable: true, userInvocable: true };
const RANK = 600;

/** Category rollup used by `action: "list"` and the entry skill body. */
function categoryTree() {
  const roots = new Map();
  for (const entry of CATALOG) {
    const [root, child] = entry.categoryPath;
    const bucket = roots.get(root) ?? { name: root, count: 0, children: new Map() };
    bucket.count += 1;
    if (child) bucket.children.set(child, (bucket.children.get(child) ?? 0) + 1);
    roots.set(root, bucket);
  }
  return [...roots.values()]
    .sort((a, b) => b.count - a.count)
    .map((bucket) => ({
      name: bucket.name,
      count: bucket.count,
      children: [...bucket.children.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    }));
}

const CATEGORY_TREE = categoryTree();

const ENTRY_DESCRIPTION =
  `${CONFIG.displayName}｜${CONFIG.skillCount} 个技能。适用：${CONFIG.audience}。覆盖：${CONFIG.scope}。` +
  `${CONFIG.exclusion ? `${CONFIG.exclusion}。` : ''}先用 ${CONFIG.toolName} 检索技能，再按技能正文执行。`;

const ENTRY_BODY = `# ${CONFIG.displayName}

本插件内置 **${CONFIG.skillCount} 个技能**，每个技能都保留原始 \`SKILL.md\`、\`references/\`、\`scripts/\` 与 \`agents/\` 元数据。技能不会全部进入上下文，而是按需检索、按需读取。

## 什么时候用

用户提到电商运营问题（选品、Listing、广告、关键词、库存、合规、申诉、利润、多站点等），且问题落在本库范围内：${CONFIG.scope}。若问题不在本库范围内，先说明并用 ${CONFIG.toolName} 检索，检索不到就直说本库没有。

## 必须的工作流

1. **先搜索**：调用 \`${CONFIG.toolName}\`，参数 \`action: "search"\`，\`query\` 用用户的关键词（中文、英文、指标名、ASIN 都可以）。默认返回最多 8 条候选，含标题、分类、是否带 references/scripts。
2. **再读技能**：\`action: "read"\`，\`name\` 用候选里的技能名。返回去 frontmatter 的正文和同级文件清单。
3. **读引用**：正文里写 \`references/xxx.md\` 时，用 \`action: "file"\`，\`name\` + \`file: "references/xxx.md"\` 读取；脚本同理，需要本机 \`python3\`。
4. **按正文执行**：严格遵循技能里的「工作流 / 不可妥协的边界 / 必须交付的结果」。正文没写的步骤不要自行补。

## 不要做

- 不要凭印象编造技能内容；先读再答。
- 技能涉及 MCP 或第三方数据（sorftime、sellersprite、keepa、apify、SIF、MPstats 等）时，没有凭据或工具就只给流程与清单，并明确标注「未取数」。
- 不要一次读很多技能；先搜后读，需要时再读 references。

## 检索提示

- 中文关键词命中率最高（描述与正文以中文为主）；英文缩写（ACOS、ROAS、FBA、A+、PPC、VAT）也可以直接搜。
- 想浏览结构用 \`action: "list"\`：共 ${CATEGORY_TREE.length} 个一级分类。
- 分类示例：${CATEGORY_TREE.slice(0, 8).map((category) => `${category.name}(${category.count})`).join('、')}。
`;

const provider = {
  name: CONFIG.providerName,
  list() {
    return Promise.resolve([
      {
        name: CONFIG.skillName,
        description: ENTRY_DESCRIPTION,
        invocation: INVOCATION,
        provider: CONFIG.providerName,
        source: 'bundled',
        rank: RANK,
        resourceBase: { kind: 'directory', path: SKILLS_ROOT },
        locator: CONFIG.skillName,
      },
    ]);
  },
  async get() {
    return {
      name: CONFIG.skillName,
      description: ENTRY_DESCRIPTION,
      invocation: INVOCATION,
      provider: CONFIG.providerName,
      source: 'bundled',
      resourceBase: { kind: 'directory', path: SKILLS_ROOT },
      content: ENTRY_BODY,
    };
  },
};

/** Find a catalog entry by exact name, then case-insensitively. */
function findEntry(name) {
  const wanted = String(name ?? '').trim();
  if (!wanted) return null;
  const exact = CATALOG.find((entry) => entry.name === wanted);
  if (exact) return exact;
  const folded = wanted.toLowerCase();
  return CATALOG.find((entry) => entry.name.toLowerCase() === folded) ?? null;
}

/** Nearby skill names to suggest when a lookup misses. */
function suggestNames(name) {
  const matches = searchEntries(CATALOG, name ?? '', { limit: 3 });
  return matches.map((entry) => entry.name);
}

/** Error text for a failed name lookup, with suggestions when available. */
function missingSkill(action, name) {
  const suggestions = suggestNames(name);
  const hint = suggestions.length ? `相近技能：${suggestions.join('、')}。` : '用 action="search" 换个关键词检索。';
  return { ok: false, action, error: `没有找到技能「${name ?? ''}」。${hint}` };
}

/** Recursively list a skill directory, capped for prompt safety. */
async function listFiles(dir, prefix = '') {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (out.length >= MAX_LISTED_FILES) break;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await listFiles(join(dir, entry.name), rel)));
    else {
      const info = await stat(join(dir, entry.name));
      out.push(`${rel} (${info.size} B)`);
    }
  }
  return out.slice(0, MAX_LISTED_FILES);
}

/** Summarize one catalog entry for a search result line. */
function summarize(entry) {
  const flags = [entry.hasReferences ? 'references' : '', entry.hasScripts ? 'scripts' : ''].filter(Boolean).join('+');
  return {
    name: entry.name,
    title: entry.title,
    category: entry.categoryPath.join('/'),
    mode: entry.mode,
    description: entry.description,
    flags,
  };
}

/** Execute one tool action and return its canonical value. */
async function runAction(args) {
  const action = String(args.action ?? 'search');
  if (action === 'search') {
    const limit = Math.min(Math.max(Number(args.limit ?? 8) || 8, 1), 20);
    const hits = searchEntries(CATALOG, args.query ?? '', { limit, category: args.category ?? null });
    return { ok: true, action, result: { total: CATALOG.length, matches: hits.map(summarize) } };
  }

  if (action === 'list') {
    if (args.category !== undefined && args.category !== null && String(args.category).trim() !== '') {
      const wanted = String(args.category).trim().toLowerCase();
      const matches = CATALOG.filter((entry) => entry.categoryPath.some((segment) => String(segment).toLowerCase() === wanted));
      if (matches.length === 0) {
        return { ok: false, action, error: `没有分类「${args.category}」。先用 action="list" 查看分类。` };
      }
      const children = new Map();
      for (const entry of matches) {
        const index = entry.categoryPath.findIndex((segment) => String(segment).toLowerCase() === wanted);
        const child = entry.categoryPath[index + 1];
        if (child) children.set(child, (children.get(child) ?? 0) + 1);
      }
      return {
        ok: true,
        action,
        result: {
          total: matches.length,
          category: String(args.category).trim(),
          categories: [...children.entries()]
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count),
          skills: matches.slice(0, MAX_DRILLDOWN_SKILLS).map(summarize),
          truncated: matches.length > MAX_DRILLDOWN_SKILLS,
        },
      };
    }
    const total = CATALOG.reduce((sum, entry) => sum + 1, 0);
    return { ok: true, action, result: { total, categories: CATEGORY_TREE } };
  }

  if (action === 'read') {
    const entry = findEntry(args.name);
    if (!entry) return missingSkill(action, args.name);
    const dir = join(SKILLS_ROOT, entry.dir);
    const raw = await readFile(join(dir, 'SKILL.md'), 'utf8');
    const body = clampText(stripFrontmatter(raw), 20000);
    return {
      ok: true,
      action,
      result: {
        name: entry.name,
        title: entry.title,
        category: entry.categoryPath.join('/'),
        mode: entry.mode,
        description: entry.description,
        files: await listFiles(dir),
        content: body,
      },
    };
  }

  if (action === 'file') {
    const entry = findEntry(args.name);
    if (!entry) return missingSkill(action, args.name);
    const dir = join(SKILLS_ROOT, entry.dir);
    const target = resolveInside(dir, args.file ?? '');
    if (!target) return { ok: false, action, error: 'file 必须是技能目录内的相对路径，且不能越界。' };
    let info;
    try {
      info = await stat(target);
    } catch {
      return { ok: false, action, error: `技能内没有文件「${args.file}」。先用 action="read" 查看文件清单。` };
    }
    if (info.isDirectory()) return { ok: false, action, error: `「${args.file}」是目录；请给出具体文件路径。` };
    const read = await readText(target, { maxChars: MAX_FILE_CHARS, maxBytes: MAX_FILE_BYTES });
    if (read.tooLarge) {
      return { ok: false, action, error: `文件 ${args.file} 有 ${read.size} 字节，超过 ${MAX_FILE_BYTES} 字节上限。` };
    }
    if (read.binary) {
      return { ok: false, action, error: `「${args.file}」含二进制内容，无法按文本读取。` };
    }
    return {
      ok: true,
      action,
      result: { name: entry.name, file: args.file, content: read.text, truncated: read.truncated, size: read.size },
    };
  }

  return { ok: false, action, error: `未知 action「${action}」。可用：search / list / read / file。` };
}

/** Render a canonical value into model-facing text. */
function renderResult(_args, value) {
  if (!value.ok) return [{ type: 'text', text: `错误：${value.error}` }];

  if (value.action === 'search') {
    const { total, matches } = value.result;
    if (matches.length === 0) {
      return [{ type: 'text', text: `没有匹配的技能（库内共 ${total} 个）。换关键词，或先用 action="list" 看分类。` }];
    }
    const lines = matches.map(
      (match) =>
        `- ${match.name} — ${match.title}｜${match.category}${match.mode ? `｜${match.mode}` : ''}${match.flags ? `｜${match.flags}` : ''}\n  ${match.description}`,
    );
    return [{ type: 'text', text: `匹配 ${matches.length} 个技能（库内共 ${total} 个）：\n${lines.join('\n')}\n\n用 action="read" + name 读取正文。` }];
  }

  if (value.action === 'list') {
    if (value.result.skills) {
      const { category, total, categories, skills, truncated } = value.result;
      const children = categories.length ? `（子分类：${categories.map((child) => `${child.name}:${child.count}`).join('，')}）` : '';
      const lines = skills.map((skill) => `- ${skill.name} — ${skill.title}${skill.mode ? `｜${skill.mode}` : ''}`);
      const more = truncated ? `\n…（只列前 ${MAX_DRILLDOWN_SKILLS} 个，共 ${total} 个；可用 action="search" 加 category 缩小）` : '';
      return [{ type: 'text', text: `分类 ${category}：${total} 个技能${children}\n${lines.join('\n')}${more}\n\n用 action="read" + name 读取正文。` }];
    }
    const lines = value.result.categories.map((category) => {
      const children = category.children.length ? `（${category.children.map((child) => `${child.name}:${child.count}`).join('，')}）` : '';
      return `- ${category.name}: ${category.count}${children}`;
    });
    return [{ type: 'text', text: `共 ${value.result.total} 个技能：\n${lines.join('\n')}` }];
  }

  if (value.action === 'file') {
    const { content, truncated, size } = value.result;
    const note = truncated ? `\n\n（文件共 ${size} 字节，已截断为前 ${MAX_FILE_CHARS} 字符）` : '';
    return [{ type: 'text', text: `${content}${note}` }];
  }

  if (value.action === 'read') {
    const { name, title, category, mode, description, files, content } = value.result;
    const header = `# ${name}\n\n标题：${title}\n分类：${category}${mode ? `｜模式：${mode}` : ''}\n描述：${description}\n\n同级文件：\n${files.map((file) => `- ${file}`).join('\n') || '- （无）'}\n\n---\n\n`;
    return [{ type: 'text', text: header + content }];
  }

  return [{ type: 'text', text: String(value.result.content ?? '') }];
}

/** Cordis plugin name. */
export const name = CONFIG.providerName;

/** Services this plugin needs. */
export const inject = ['skills', 'tools'];

/** Register the entry skill and the search tool. */
export function apply(ctx) {
  ctx.skills.registerProvider(() => provider);

  ctx.tools.register({
    name: CONFIG.toolName,
    description:
      `${CONFIG.displayName}（${CONFIG.skillCount} 个技能，${CONFIG.scope}）。` +
      `action="search" 用 query 检索技能；action="list" 看分类（带 category 可下钻到技能清单）；action="read" 用 name 读技能正文与文件清单；` +
      `action="file" 用 name + file 读技能内的 references/scripts 文本（超长自动截断）。`,
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['search', 'list', 'read', 'file'],
          description: 'search 检索 / list 分类（可下钻） / read 读正文 / file 读引用文件。',
        },
        query: { type: 'string', description: 'search 用关键词（中文或英文）。' },
        category: { type: 'string', description: '可选：限定分类，如 shopify、douyin；list 时下钻到该分类的技能清单。' },
        name: { type: 'string', description: 'read / file 用的技能名（来自 search 结果）。' },
        file: { type: 'string', description: 'file 用的技能内相对路径，如 references/topic.md。' },
        limit: { type: 'integer', description: 'search 返回条数，1-20，默认 8。' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          action: { type: 'string' },
          result: {},
          error: { type: 'string' },
        },
        required: ['ok', 'action'],
        additionalProperties: false,
      },
      render: renderResult,
    },
    isConcurrencySafe: () => true,
    execute: async (args) => runAction(args),
  });
}
