# SeaLeap 技能库 → DeepSeek Harness 插件 设计

- 日期：2026-11-06
- 状态：待批准
- 仓库：`sealeap-amazon-skills`（602 技能）、`sealeap-ecommerce-skills`（195 技能）
- 分析依据：[analysis-amazon.md](../analysis-amazon.md)、[analysis-ecommerce.md](../analysis-ecommerce.md)

## 1. 意图与为什么要这么做

把两个开源的 SeaLeap「技能」仓库变成 DeepSeek Harness（DSH）里可直接使用的插件：用户在会话里提到亚马逊/跨平台电商运营问题（选品、Listing、广告、合规、库存……）时，模型能自动发现对应技能、读取正文与参考资料，再按技能里的流程干活。

关键约束来自实测：**602 个亚马逊技能的 description 合计约 17.6 万字符（≈13.7 万 token）**。DSH 会把每个 `modelInvocable` 技能的名字+描述写进会话的系统提示，所以「全部注册成原生技能」在上下文上不可行。

## 2. 目标 / 非目标 / 反目标

**目标**
- 两个可独立启停的插件：`@local/sealeap-amazon-skills`、`@local/sealeap-ecommerce-skills`
- 完整保留 797 个技能：`SKILL.md` + `references/` + `scripts/` + `agents/`，目录树与原仓库一致
- 上下文成本恒定：每个插件只往会话技能目录里加 **1 条**入口技能
- 模型可通过工具检索、读取任意技能正文与其引用文件
- 无网络、无第三方凭据时仍可用（降级为纯流程指引）

**非目标**
- 不翻译/不改写技能内容；不修改两个原仓库
- 不把 797 条全部注册为原生技能
- 不发布到公共 npm；以本地 `link:` 方式安装（与现有 `@local/superpowers-skills` 一致）
- 不做向量检索/嵌入模型；用轻量本地词法检索

**反目标（即使能用也算失败）**
- 安装后会话提示明显变长，或技能正文被截断丢失
- 相对链接失效（`references/*.md` 打不开）
- 工具无法在无凭据环境下给出可执行的工作流

## 3. 约束

| 约束 | 内容 |
|---|---|
| DSH 版本 | 0.2.2-rc.1（本机） |
| 插件模板 | `@local/superpowers-skills`：单包 + `dsh.bundle.patch` + 自插入 row；`pnpm add <绝对路径>` 记录为 `link:` |
| 插件源目录 | `~/dsh-plugins/<包名>`（与 superpowers 插件一致） |
| 载荷 | 亚马逊 20.1 MB（其中 9.1 MB 是 269 份逐字相同的 `mcp_research.py`）；电商 2.8 MB |
| 许可 | MIT（SeaLeap）。必须随包提供根 LICENSE/NOTICE/THIRD_PARTY_NOTICES；电商每技能 LICENSE 有 3 种变体，需原样保留 |
| 编码 | 全 UTF-8、无 BOM、无符号链接、0 绝对路径、0 断链 |
| 行尾 | 原仓库工作区是 CRLF、git blob 是 LF；打包用 `core.autocrlf=false` 的干净导出，避免逐字节差异 |
| 凭据 | 324/602 个亚马逊技能涉及 MCP（sorftime / sellersprite / keepa / apify / SIF），凭据只从环境变量读；26 个 OZON 技能依赖 MPstats+HOLD |

## 4. 方案（已选定：A + 两个插件）

每个插件 = 一个 npm 包（单包自插入 bundle，不拆 bundle/provider 两包）：

```
sealeap-amazon-skills/
  package.json          # dsh.bundle.patch -> ./cordis.patch.yml
  cordis.patch.yml      # insert: {id, name: '@local/sealeap-amazon-skills'}（自插入）
  index.js              # cordis 插件：apply(ctx) 注册 skill provider + tool
  lib/catalog.js        # 构建期生成：技能清单 + 检索关键词
  lib/search.js         # 纯函数：分词、打分、排序（可单测）
  lib/read.js           # 纯函数 + 文件读取：路径规范化、大小限制、frontmatter 剥离
  skills/               # 原仓库内容根（保持相对路径）
  LICENSE / NOTICE / THIRD_PARTY_NOTICES
  icon.svg
  test/*.test.js        # node --test
```

**技能提供器**：注册 1 个入口技能（`rank 600`、`source: bundled`、`modelInvocable + userInvocable`、`resourceBase` 指向 `skills/` 根）。正文是一份「使用说明」：什么时候该检索、工具怎么调、读到技能后如何按流程执行、无凭据时如何降级。

**工具**（`ctx.tools.register`，手写 ToolDefinition，不引入 `@deepseek-ai/dsh-tools` 依赖以避免 profile 里出现重复实例）：

| 工具 | 作用 |
|---|---|
| `sealeap_amazon` / `sealeap_ecommerce` | `action: search \| list \| read \| file` |

- `search`（默认）：`query` + 可选 `category` / `limit`，字段加权打分（name×4、description×2、category×1、正文×0.5），返回 name、分类、描述、是否带 references/scripts。
- `list`：分类树与计数（source / creator / 平台 / mode）。
- `read`：`name` → 完整 `SKILL.md` 正文（去 frontmatter）+ 同级文件清单。
- `file`：`name` + 相对路径 → 读取 references/scripts 文本（限 256 KB，规范化后必须仍在技能目录内）。

输出走 `output.schema` + `render()` 生成文本内容块；错误（未找到、路径越界、超大文件）作为结构化结果返回，不抛异常。

**打包数据**
- 亚马逊：保留 `amazon-skills/` 全部内容与目录树；排除 2 个商标 PNG（分析建议）。
- 电商：内容根是 `sealeap-amazon-skills/`（命名遗留，非重复），**必须包含并去掉这层前缀**；排除 `validate_*.py`、`test_policy_refresh_validation.py`、`RESEARCH-*.md`、`VALIDATION.md` 等开发产物，保留 3 个法律文件与每技能 LICENSE。
- 不扁平化、不去重 `mcp_research.py`（269 个副本合计 9 MB，但改目录结构会破坏既有相对链接，收益不值）。

## 5. 安装与验证

1. 源目录：`~/dsh-plugins/sealeap-{amazon,ecommerce}-skills`
2. `plugin_manager install_bundle` 传绝对路径 → profile `dependencies` 记录 `link:`，`dsh.profile.bundles` 追加两个包
3. 验证清单：
   - `plugin_manager list_plugins` 出现两个 bundle 且 `enabled`
   - 新会话技能目录出现两条入口技能（上下文只多 2 条）
   - 实际调用：`search` 能命中（如「ACOS 诊断」「OZON 选品」），`read` 能返回正文与文件清单，`file` 能读 references
   - 相对链接完整：抽查技能正文里的 `references/...` 能读到
4. 卸载：从 profile 移除依赖与 bundles（`pnpm remove` + 编辑 `dsh.profile.bundles`），源目录不动

## 6. 测试（TDD）

- 单测（`node --test`）：分词与打分排序、`list` 分类树、`read` frontmatter 剥离、`file` 路径穿越拒绝 + 大小上限
- 集成：用假 `ctx`（stub `skills.registerProvider` / `tools.register`）加载 `index.js`，断言 provider 的 `list/get` 与工具定义结构、参数校验
- 构建校验：索引条目数 == 目录数（602 / 195）、name 唯一、无断链
- 端到端：安装后在本会话下一步实际调用工具（DSH 下一步会带上新工具），确认真实可用

## 7. 风险与缓解

| 风险 | 缓解 |
|---|---|
| bundle 自插入/校验失败，插件不加载 | 先做最小探针包（1 个假技能 + 1 个假工具）验证安装链路，再灌数据 |
| 22 MB 数据复制慢/出错 | 用 `git -c core.autocrlf=false archive` 或 robocopy 导出，校验文件数与哈希 |
| 602 条索引在运行期构建拖慢启动 | 构建期生成 `lib/catalog.js`，运行期只读常量 |
| 工具 API 形状猜错（`output.schema`/`render`） | 探针里真实调用一次，失败再按报错调整 |
| 无凭据/MCP 缺失时模型硬编数据 | 入口技能正文明确「无工具时只给流程与清单，不编造数据」 |
| 插件装了但本会话看不到工具 | 以「下一轮/新会话」为准验证；必要时重启 DSH |

## 8. 我的判断（可按需要改）

- 包名 `@local/sealeap-amazon-skills` / `@local/sealeap-ecommerce-skills`；工具名 `sealeap_amazon` / `sealeap_ecommerce`
- 入口技能名 `sealeap-amazon-knowledge` / `sealeap-ecommerce-knowledge`
- 两个插件互不依赖，各自独立完整
- 设计文档放 `docs/superpowers/specs/`，实现计划放 `docs/superpowers/plans/`
