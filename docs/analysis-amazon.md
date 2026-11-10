# SeaLeap Amazon Skills 仓库分析报告

> 供「把 602 个 Skill 打包为 DeepSeek Harness（DSH）插件」决策使用。
> 数据源：`research/sealeap-amazon-skills`（shallow clone，HEAD `1283764556e61cbe56c600bbe504b8731b2254cb`，提交时间 2026-10-16T11:24:32+08:00）。
> 分析时间：2026-11-06（Asia/Shanghai）。扫描脚本为本地一次性脚本（不随仓库发布，单次遍历全树，UTF-8 输出）。
> 结构化清单为生成产物（`docs/inventory/amazon.json`，602 条、535 KB，不随仓库发布）。
> 计量口径：**MB = 10^6 字节**；工作区文件因 `core.autocrlf` 为 CRLF，git blob 为 LF。

---

## 1. 总览

| 指标 | 数值 |
|---|---|
| Skill 数（`SKILL.md`） | **602** |
| 内容来源（source 目录） | **8** |
| 分类组（source/creator） | **38**（36 个 creator 目录 + 2 个无 creator 层级的 source） |
| 仓库文件数（不含 `.git`） | 3,709（3,707 文本 + 2 PNG） |
| 仓库总载荷 | 20.47 MB（工作区 CRLF）／**20.08 MB（git blob, LF）** |
| Skill 载荷（SKILL.md + 随附文件） | 19.13 MB |
| ├ SKILL.md | 2.69 MB（602 个，均值 4.47 KB） |
| └ 随附文件 | 16.44 MB（3,054 个） |
| 正文总量 | 1,092,228 字符（仅 SKILL.md 去掉 frontmatter） |
| 许可 | MIT（2026 SeaLeap）+ 仓库级 NOTICE；10 个 hermes Skill 含上游第三方 MIT |
| 编码 / 二进制 / 符号链接 | 全部 UTF-8 无 BOM；仅 2 个 PNG；0 符号链接 |
| git 跟踪文件 EOL | blob 全 LF，工作区全 CRLF（`i/lf w/crlf`） |

---

## 2. 目录结构与分类统计

`amazon-skills/` 下有两种深度，不能用同一套切分规则：

- **2 级**（`amazon-skills/<source>/<skill>/SKILL.md`，50 个）：`amazon-official`（38）、`public-research`（12）。
- **3 级**（`amazon-skills/<source>/<creator>/<skill>/SKILL.md`，552 个）：其余 6 个 source，creator 为匿名神兽代号（不映射到真实作者）。

| source | Skill | creator 目录 | 文件数 | 载荷 MB | references 文件 | .py 脚本 |
|---|---:|---:|---:|---:|---:|---:|
| amazon-official（官方授权内容） | 38 | 0（直挂） | 217 | 0.70 | 134 | 6 |
| app（Athena 39 / Apollo 52 / Hermes 10） | 101 | 3 | 1,267 | 3.09 | 921 | 10 |
| douyin（抖音公开知识） | 211 | 7（baize 33、pixiu 35、qilin 34、qinglong 20、xiezhi 35、yinglong 31、zhuque 23） | 1,190 | 9.90 | 582 | 180 |
| weixin（微信公开知识） | 108 | 13 | 380 | 1.72 | 129 | 20 |
| bilibili（B 站公开知识） | 74 | 8 | 322 | 2.59 | 122 | 44 |
| youtube（YouTube 公开知识） | 49 | 4 | 202 | 1.51 | 75 | 25 |
| xiaohongshu（小红书公开知识） | 9 | 1 | 38 | 0.15 | 18 | 0 |
| public-research（公开资料专题） | 12 | 0（直挂） | 87 | 0.12 | 34 | 3 |
| **小计（amazon-skills/ 子树）** | **602** | **36** | **3,703** | **19.78** | **2,015** | **288** |
| 仓库根（README/LICENSE/NOTICE/.gitignore/2 PNG） | – | – | 6 | 0.69 | – | – |
| **合计（全仓，不含 .git）** | **602** | **36** | **3,709** | **20.47** | **2,015** | **288** |

- `categoryPath` 的最大信息量是 **[source]** 或 **[source, creator]**，共 38 个取值；source 层是内容来源，creator 层是**匿名代号**（README 明确：代号不公开对应任何具体创作者），因此 `creator` 只能当分组键，不能当作者/署名。
- 载荷高度集中：douyin 占 9.90 MB（48%），其中 180 份 `.py` 共 5.97 MB。
- 每分类组都有 `README.md` 索引：37 个分类 README 全部提到本组全部 Skill（0 漏项），但只有 10 个用相对链接指向 `SKILL.md`，其余仅在表格里列裸名字——**索引本身不可用于遍历，必须遍历目录**。

---

## 3. Frontmatter 模式

602/602 都有合法 frontmatter（`---` 包裹），无缺失、无 YAML 嵌套块、无 `>`/`|` 多行标量、无锚点/流式数组。键集合（并集，按出现次数）：

| 键 | 出现 | 必填？ | 类型/说明 |
|---|---:|---|---|
| `name` | 602 | **是** | 单行字符串，`sealeap-` 前缀 |
| `description` | 602 | **是** | 单行字符串，50–882 字符（均值 292），488 条含中文 |
| `license` | 62 | 否 | 固定值 `"MIT; see LICENSE and NOTICE"`（JSON 内实际值为 `MIT; see LICENSE and NOTICE`），仅 app/apollo 52 + app/hermes 10 |
| `metadata` | 12 | 否 | 唯一嵌套键 `metadata.verified_at: "2026-09-23"`，仅 public-research 12 个 |

要点：

- **name 唯一且等于目录名**：602 个 name 全部唯一（含大小写不敏感比较 0 重复），602/602 与 Skill 目录名完全一致，全部以 `sealeap-` 开头，长度 23–63 字符。
- **description 引号风格不统一**：555 条用双引号包裹（内含 `:`、`;`、`,`、中文逗号），47 条为裸标量。任何解析都要先“去引号”，否则描述会带 `"`。
- **描述重复**：2 组 description 逐字相同（去引号后比较）——`sealeap-pixiu-amazon-fba-inventory-reviews` 与 `sealeap-yinglong-amazon-fba-inventory-reviews`（2 个）；`pixiu`/`yinglong`/`zhuque` 三个 `amazon-operator-review-experience`（3 个）。列表页会出现不可区分的描述。
- 没有 `version`、`allowed-tools`、`author`、`tags` 等常见字段；也没有 `title`——人类可读标题在正文首个 H1（9–40 字符，602/602 都有）。

---

## 4. 正文约定

- **规模**：`bodyChars` 760–7,431，均值 1,814，p50 1,800，p90 2,628，p99 3,289；最大单文件 `sealeap-amazon-apparel-lifecycle-ads/SKILL.md`（7,431 字符 / 16,745 B）。平均 62 行。
- **语种**：`zh-en` 331 个、`zh-CN` 271 个、纯英文 0 个。正文是“中文流程 + 英文目标句”的混合体。
- **结构高度模板化**（`##` 级标题词频）：`工作流` 549、`目标` 465、`不可妥协的边界` 454、`必须交付的结果` 453、`开始前要拿到` 451、`先判断任务模式` 214、`适用任务` 202、`第三方 MCP 数据` 173、`使用范围` 118、`专项路由` 118。
- **几乎不含代码块**：仅 7 个 Skill 有代码围栏（合计 16 块，多为 `python3 scripts/...` 命令行）；402 行 Markdown 表格。正文是散文式操作规程，不是代码模板。
- **相对链接是唯一引用方式**：602 个 SKILL.md 共 1,651 个内链，其中 1,527 个指向 `references/*`、124 个指向同目录 `LICENSE`/`NOTICE`；0 个外链、0 个绝对路径、0 个断链。全仓 2,611 个 Markdown 共 5,261 个链接：3,556 个同级相对、246 个 `../` 相对、1,459 个 http(s) 外链，**内部断链 0**。
- **绝对路径/机器路径：0**。全部 2,611 个 md 中未发现 `C:\`、`D:\`、`/Users/`、`/home/`、`file://` 或 `~/`。
- **跨 Skill 引用极少**：只有 `app/athena/sealeap-athena-find-skills` 用 `$sealeap-...` 形式引用 1 个其它 Skill，且该名已失效（见 §8-P7）。

---

## 5. 随附文件（references / scripts / agents / assets）

3,054 个文件、16.44 MB。按 Skill 内一级子目录：

| 目录 | 文件数 | 大小 MB | 覆盖 Skill 数 | 内容 |
|---|---:|---:|---:|---|
| `references/` | 2,015 | 6.82 | 595 | Markdown 证据/手册/模板，含 1 个 CSV（50,994 B，Prime Day 数据）；单 Skill 1–81 个，均值 3；最大 `references/topic-cards.md` 22.9 KB |
| `scripts/` | 288 | 9.26 | 287 | 全部 Python；**269 个是同一份 `mcp_research.py`（33,944 B）的逐字副本** |
| `agents/` | 602 | 0.24 | 602 | 每个 Skill 恰好 1 个 `agents/openai.yaml` |
| `assets/` | 1 | 0.007 | 1 | 仅 `apollo-ads-demo/assets/demo.html` |
| Skill 根目录 | 148 | 0.11 | 74 | 74 个 `LICENSE` + 74 个 `NOTICE`（app 62 + public-research 12） |

- **脚本运行时**：288 个 `.py` 全部 `#!/usr/bin/env python3`、全部带 `argparse` 与 `if __name__ == "__main__"`，无 venv/requirements 文件。依赖仅标准库；269 个文件中 `jsonschema` / `referencing` 为**函数内可选导入**（缺失时降级为不校验 schema）。类型注解较新（275 个用 `dict[str, Any]`、272 个用 `X | None`，278/288 已 `from __future__ import annotations`），部署建议以 **Python 3.10+** 为准。
- **`agents/openai.yaml` 是 OpenAI 风格的界面元数据**，不是 DSH 原生格式：`interface.display_name`（≤42 字符）、`interface.short_description`（≤62 字符）、`interface.default_prompt`（≤171 字符，含 `$skill-name` 调用写法）。打包时若要展示名/一句话描述，这是唯一现成来源；但要由 `$name` 改写为 DSH 的调用方式。
- **脚本与正文脱节**：98 个 Skill 带 `scripts/` 但正文完全没提 `scripts/`（脚本无调用说明）；反之 0 个“正文提到脚本但没有脚本目录”。
- **第三方数据/工具依赖**：324/602 个 Skill 提到 MCP 或外部服务（`mcp` 272、`sorftime` 24、`sif` 19、`sellersprite` 12、`apify` 5、`keepa` 3）。凭据只从环境变量读取（脚本显式禁止 token 进命令行/URL/日志），插件侧必须做“无凭据时降级为纯流程指引”。

---

## 6. catalog.json 的真实地位

只有 3 个文件，且**三套互不兼容的 schema**：

| 文件 | 顶层键 | 条目 | 条目键 | 与目录一致性 |
|---|---|---:|---|---|
| `app/apollo/catalog.json` | `collection, skill_count, source_package_count, installed, skills` | 52 | `name, title, group, path` | 52 目录 ↔ 52 条目，0 缺 0 多 |
| `app/athena/catalog.json` | `schema_version=2, entrypoint_count=39, capability_count=227, …, skills` | 39 | `name, title, description, category, path, mode, route, capabilities[], limitation, subcapabilities[]` | 39 ↔ 39，0 缺 0 多 |
| `public-research/catalog.json` | `schema_version, count, skills` | 12 | `name, title, description, path, verified_at` | 12 ↔ 12，0 缺 0 多 |

结论：**catalog.json 不是权威索引**，不能作为打包唯一事实源。

1. 8 个 source 中只有 3 个有 catalog（覆盖 103/602），其余 5 个（499 个 Skill）没有；
2. 三者 schema 不同，`path` 语义不同（apollo 为 `<dir>/SKILL.md`，athena 为 `<dir>`，public-research 为 `<dir>/SKILL.md`），且都相对“集合目录”而非仓库根；
3. apollo 里有 `"installed": false`，说明它只是发布清单而非安装状态；
4. athena 的 `capability_count: 227`（226 个业务能力）远超 39 个入口目录——能力被折叠进 `references/capabilities/**`，catalog 的信息量大于 SKILL.md；
5. 3 个 catalog 与目录完全对得上（0 漂移），所以**可作交叉校验**，不能作 source of truth。权威事实源 = **目录树 + SKILL.md frontmatter**。

---

## 7. 许可与 NOTICE 义务

- **仓库级**：`LICENSE` = MIT（Copyright (c) 2026 SeaLeap，1,085 B）；`NOTICE`（694 B）三条限制必须在再分发时一并保留：
  1. MIT 只覆盖 SeaLeap 原创软件与文档；
  2. **不授予商标/品牌素材使用权**，包括 Amazon Advertising、SeaLeap 名称与徽标；仓库内 Amazon Advertising logo 是“获准使用”，仍受 Amazon 品牌与营销规范约束；
  3. 标注来源于第三方的素材、转录、摘录仍归其权利人，**未被 MIT 再许可**（README 补充：公开版只发布独立编写的知识提炼，不发布原始课程、逐字稿、社媒原帖或来源映射）。
- **Skill 级覆盖不均**：74/602 个 Skill 目录内自带 `LICENSE` + `NOTICE`（app 62 = apollo 52 + hermes 10，public-research 12），其余 **528 个 Skill 目录内没有任何许可文件**。插件必须在包根与每个 Skill 可见的位置补发仓库级 `LICENSE` + `NOTICE`，不能假设“每个 Skill 自带”。
- **第三方 MIT 上游（最重要的合规点）**：`app/hermes` 的 10 个 Skill 的 `LICENSE` 是 **MIT © 2024-2025 msitarzewski**（改编自 `agency-agents`，NOTICE 565 B 明确“substantially rewritten and reorganized guidance adapted from agency-agents…upstream copyright and permission notice are preserved in LICENSE”）。再分发时必须保留该上游版权与许可声明，且不得暗示上游背书。
- **品牌素材**：`assets/sealeap-logo.png`（659,818 B）与 `assets/amazon-ads-logo.png`（13,847 B）合计 673,665 B，占根级载荷的绝对多数，却是**唯一受商标限制的二进制文件**。打包建议：默认不随插件分发（README 的徽章/logo 不属于 Skill 运行所需），或原样保留并在 NOTICE 中声明。

---

## 8. 打包风险（按优先级）

- **P1 · 冗余占近半载荷（可优化 9.28 MB）**：全仓 27 组内容完全相同的文件，冗余 9,281,165 B。最大项是 `scripts/mcp_research.py` 的 **269 份逐字副本（33,944 B × 269 = 9,130,936 B = 9.13 MB）**；其余为 LICENSE/NOTICE 的多份重复副本（同一哈希最多 65 份）与若干 `tool-routing.md`（8–13 份）。方案：内容寻址（sha256）去重 + 插件内共享资源目录，但**必须保留每个 Skill 的 `scripts/` 相对路径**（见 P3）。
- **P2 · 换行符与哈希不一致**：工作区所有文本文件是 CRLF（`git ls-files --eol` 全为 `i/lf w/crlf`），git blob 为 LF，二者差 393,681 B（约 +2%）。用 `Copy-Item` 直接拷工作区会得到 CRLF 版本，与上游打出的 sha256/大小不一致，且 CRLF 会进入 YAML/Markdown 解析路径。方案：用 `git archive` 或 `git -c core.autocrlf=false clone/checkout` 生成 LF 载荷。
- **P3 · 相对链接会被扁平化破坏**：1,527 个 SKILL.md → `references/*` 链接、3,802 个仓内相对链接（含 246 个 `../` 上跳）、`python3 scripts/xxx.py --input references/xxx.json` 的命令约定，全部依赖**目录原样保留**。不能把 602 个 SKILL.md 抽成单个大文件或改名为 `<name>.md` 平铺，否则所有 references/scripts 引用失效（当前内部断链数为 0，这是个值得保持的优点）。
- **P4 · 编码看似安全，但描述必须正确解码**：0 个非 UTF-8、0 个 BOM、0 个非法字节；488/602 条 description 含中文。风险在于 555 条 description 是**双引号包裹的 YAML 标量**（含 `:`、`;`、`，`），直接正则截取会带引号或截断；`license` 值含分号。方案：用真正的 YAML 解析（js-yaml）而非行级切分，输出前统一去引号。
- **P5 · 名称冲突：仓内 0，但规则要显式**：602 名唯一、名=目录名、全部 `sealeap-` 前缀（23–63 字符）；与 ecommerce 仓库（195 个 `sealeap-<platform>-`）交叉 0 冲突。但插件要求全局唯一 ID，仍应在构建期做大小写不敏感 + 跨仓校验（Windows/macOS 文件系统大小写不敏感）。
- **P6 · 上下文预算**：正文合计 1,092,228 字符（CJK 为主，粗估 0.5–0.7M tokens），不可能全部注入系统提示。单条正文 760–7,431 字符、p90 2,628，适合“索引（name/description/category）+ 按需懒加载 SKILL.md + 二次按需读 references”。同时 description 均值 292、最长 882 字符，用作索引入口要把长描述截断或另存。
- **P7 · 跨 Skill 引用已失效 1 处**：`sealeap-athena-find-skills/SKILL.md` 引用 `$sealeap-athena-temu-eu-product`，该目录不存在（实际为 `sealeap-athena-temu-product-pricing`；`app/athena/migration.json` 70,991 B 保留旧名→新入口映射）。若插件做“相关 Skill 推荐/跳转”，必须先按 migration.json 重写或丢弃失效引用。
- **P8 · 描述与内容重复**：2 组完全相同的 description（2 个 + 3 个 douyin Skill，跨 creator 近重复），加上 269 份相同脚本，会让“技能列表/召回”出现多份同义技能。需要人工决定合并还是保留别名（禁止自动合并，因为 name/正文仍有差异）。
- **P9 · 二进制与商标面收窄**：非文本文件仅 2 个 PNG（673,665 B，占根级文件 97%），无符号链接、无超大文件（>1 MB 仅 sealeap-logo.png 与 git pack）。去掉/替换 logo 是性价比最高的瘦身与合规动作。
- **P10 · 元数据语义差异**：`agents/openai.yaml`（602 个）是 OpenAI 目录的界面元数据（`display_name`/`short_description`/`default_prompt`），`catalog.json`（3 个）是发布清单，`SKILL.md` frontmatter 只有 name/description——三者不能互相替代。打包时要明确“DSH 技能 id / 展示名 / 一句话描述 / 提示词”分别取自哪里，避免把 `$sealeap-...` 的 OpenAI 调用语法带进 DSH 提示词。
- **P11 · `README.md` 索引不能当清单**：37 个分类 README 都能“提到”本组全部 Skill（0 漏项），但只有 10 个是相对链接，其余是表格里的裸名字；根 README 顶部还写明“截至 2026-10-16 = 602 个”。任何一个 README 的计数都应按扫描结果校验，而不是反读 README。

---

## 9. `docs/inventory/amazon.json` 字段规约

顶层：`generatedAt`（ISO 8601，+08:00）、`repo`（clone URL）、`repoCommit`、`repoCommitDate`、`contentRoot`（`amazon-skills`）、`skillCount`（602）、`sourceCount`（8）、`categoryCount`（38）、`sourceCounts`、`platformCounts`（同 `sourceCounts` 的别名，便于与 ecommerce 清单对齐）、`payloadBytes`（含 `gitBlobTotal` 与 CRLF 说明）、`categories`（`[{source, creator, path, skillCount}]`）、`skills`。

`skills[]` 的 11 个字段（与 ecommerce 仓库清单逐字段同语义）：

| 字段 | 语义 |
|---|---|
| `name` | frontmatter `name`（= 目录名，602/602 一致） |
| `relPath` | Skill **目录**相对 clone 根的路径，正斜杠、无尾斜杠、含内容根（如 `amazon-skills/douyin/baize/sealeap-baize-amazon-ad-strategy-router`） |
| `categoryPath` | 内容根之下的分类段数组，不含 Skill 目录（`["douyin","baize"]` / `["amazon-official"]`） |
| `description` | frontmatter 原文（已去掉 YAML 引号），逐字保留 |
| `frontmatterKeys` | 顶层键，按出现顺序（`["name","description"]`，个别含 `license`/`metadata`） |
| `lang` | `zh-CN`(271) / `zh-en`(331) / `en`(0)，按正文 CJK 与 ASCII 占比判定 |
| `hasReferences` / `hasScripts` / `hasAgents` | 对应子目录存在且含 ≥1 个文件（595 / 287 / 602） |
| `assetFileCount` | Skill 目录内文件数，**不含 SKILL.md**（含 LICENSE/NOTICE/agents yaml/references/scripts），范围 1–82（均值 5.1） |
| `bodyChars` | 去掉 frontmatter 后的正文字符数（760–7,431，合计 1,092,228） |

---

## 10. 复现方式

```powershell
# 单次遍历生成清单与统计（tmp/stats.json 为分析中间产物，可丢弃）
# 该脚本与 tmp/ 均为本地一次性工具，不随仓库发布
node tmp/inventory.js
```

脚本只读 `research/sealeap-amazon-skills`，不修改仓库；输出 UTF-8 无 BOM，LF 换行。
