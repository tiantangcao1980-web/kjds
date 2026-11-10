# SeaLeap 技能库 DSH 插件 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `sealeap-amazon-skills`（602 技能）与 `sealeap-ecommerce-skills`（195 技能）分别打包成本地 DSH 插件，每个插件只加 1 条入口技能，并提供 `search/list/read/file` 检索工具按需读取全部技能。

**Architecture:** 单包自插入 bundle（模板 `@local/superpowers-skills`）：`package.json` 的 `dsh.bundle.patch` 指向 `cordis.patch.yml`，patch 插入自身；`index.js` 作为 cordis 插件在 `apply(ctx)` 里注册一个 skill provider 与一个 tool；技能数据放在包内 `skills/`，保持原仓库相对路径；`lib/catalog.js` 构建期生成。

**Tech Stack:** Node.js 24（ESM，零第三方依赖）、node:test、Cordis（DSH 0.2.2-rc.1）。

**Spec:** `docs/superpowers/specs/2026-11-06-sealeap-skills-dsh-plugins-design.md`

## Global Constraints

- 包名 `@local/sealeap-amazon-skills` / `@local/sealeap-ecommerce-skills`，版本 `1.0.0`，`private: true`，`type: module`
- 工具名 `sealeap_amazon` / `sealeap_ecommerce`；入口技能名 `sealeap-amazon-knowledge` / `sealeap-ecommerce-knowledge`
- 不做第三方 npm 依赖；只 import `node:` 内置模块
- 技能目录树必须与原仓库一致（相对链接不能断）；电商仓库的内容根是 `sealeap-amazon-skills/` 且要去掉该层前缀
- 插件源目录 `~/dsh-plugins/<包名>`；安装方式 `plugin_manager install_bundle` + 绝对路径
- 数据量：亚马逊 602 / 电商 195；索引条目数必须与目录数一致
- 中文文案；文件 UTF-8 无 BOM

## Review Focus

1. 路径穿越：`file` 动作收到 `../../x` 或绝对路径时必须拒绝，且不能读到技能目录外
2. 超长文件：单文件 > 256 KB 时必须返回错误结果而不是截断或 OOM
3. 无凭据环境：入口技能正文与工具结果都不能暗示数据已获取（只能给流程）
4. 索引漂移：`lib/catalog.js` 与磁盘技能数不一致时，插件启动应报错而不是静默少列
5. 前端 1 MB 工具结果上限：`read` 返回最大正文 7.4 KB，安全；`file` 限 256 KB；错误信息不得回显整个路径

---

### Task 1: 最小探针验证安装链路与工具 API

**Files:**
- Create: `~/dsh-plugins/sealeap-probe/package.json`
- Create: `~/dsh-plugins/sealeap-probe/cordis.patch.yml`
- Create: `~/dsh-plugins/sealeap-probe/index.js`

**Interfaces:**
- Produces: 已验证的 tool 定义形状（`parameters`/`output.schema`/`render` 的实际可用字段）与安装命令形状，供 Task 4 照抄

- [ ] **Step 1: 写探针包**（1 个假技能 + 1 个 `sealeap_probe` 工具）
- [ ] **Step 2: 安装**：`plugin_manager install_bundle` target=`~/dsh-plugins/sealeap-probe`
- [ ] **Step 3: 验证**：`list_plugins` 出现 `@local/sealeap-probe`；下一步技能目录出现探针技能；下一步真实调用 `sealeap_probe`
- [ ] **Step 4: 记录** API 形状与安装结果到 `docs/verification.md`；卸载探针

### Task 2: 纯函数库（TDD）

**Files:**
- Create: `plugin-src/lib/text.js`（分词、去 frontmatter、截断）
- Create: `plugin-src/lib/search.js`（加权打分、排序、分类过滤）
- Create: `plugin-src/lib/read.js`（安全路径解析、大小限制）
- Test: `plugin-src/test/{text,search,read}.test.js`

**Interfaces:**
- Produces:
  - `stripFrontmatter(md: string): string`
  - `tokenize(s: string): string[]`
  - `scoreEntry(entry, terms): number`；`search(entries, query, opts): Entry[]`
  - `resolveInside(root: string, rel: string): string | null`；`readCapped(file, maxBytes): Promise<string>`

- [ ] Step 1-2: 先写失败测试（路径穿越、大小上限、排序、中文分词、frontmatter 剥离）
- [ ] Step 3: 最小实现
- [ ] Step 4: `node --test plugin-src/test/` 全绿

### Task 3: 数据打包与索引生成

**Files:**
- Create: `plugin-src/scripts/pack.mjs`
- Create: `plugin-src/lib/catalog.js`（生成产物）

**Interfaces:**
- Produces: `CATALOG: {name, description, categoryPath, path, files, lang, hasReferences, hasScripts}[]`、`SKILLS_ROOT`
- [ ] Step 1: 写 `pack.mjs`（复制内容根、排除项、校验 602/195、校验 0 断链）
- [ ] Step 2: 跑亚马逊与电商两次，断言条目数
- [ ] Step 3: 生成 `lib/catalog.js`，检查 UTF-8 与体积

### Task 4: 插件入口（provider + tool）

**Files:**
- Create: `plugin-src/index.js`
- Test: `plugin-src/test/plugin.test.js`（假 ctx：stub `skills.registerProvider` / `tools.register`）

**Interfaces:**
- Consumes: Task 2 的纯函数、Task 3 的 CATALOG
- Produces: `apply(ctx)` 注册 provider（1 条入口技能）与 tool（4 个 action）
- [ ] Step 1: 集成测试（provider.list 返回 1 条；tool 定义字段齐全；search/read/file 正常与异常路径）
- [ ] Step 2: 实现、跑绿

### Task 5: 安装、端到端验证与文档

**Files:**
- Create: `docs/verification.md`、两个插件包内 `README.md`
- [ ] Step 1: 生成两个包到 `~/dsh-plugins/`
- [ ] Step 2: `plugin_manager install_bundle` 两次，`list_plugins` 校验
- [ ] Step 3: 下一步实际调用两个工具（search/read/file），记录真实输出
- [ ] Step 4: 检查会话技能目录只多 2 条；写验证报告
