# sealeap-ecommerce-skills 仓库分析（task-2）

- 仓库：`https://github.com/xjli360/sealeap-ecommerce-skills`
- 本地克隆：`research/sealeap-ecommerce-skills`（shallow clone，单提交；不随仓库发布）
- HEAD：`914f920b368fd73f867e3d03af7e48b9ab1e18ed`（2026-10-16 22:26:50 +08:00，"Refresh commerce policies and add Shopify agentic storefront audit"）
- 规模：**1099 个文件 / 2,843,689 字节（约 2.71 MiB）**，其中 195 个 `SKILL.md`
- 分析产物为生成文件：`docs/inventory/ecommerce.json`（195 条技能记录，UTF-8 无 BOM，不随仓库发布）
- 分析方式：node 全树单次扫描 + 只读对照 `research/sealeap-amazon-skills`（602 skills）；抽样复核脚本为本地临时脚本（不属交付物）

## 0. 先纠正一个前提

任务描述说"顶层是 ebay/etsy/... 八个平台目录，另有嵌套的 sealeap-amazon-skills/"。**实际不是这样**：
仓库根目录只有 `assets/`、`sealeap-amazon-skills/` 和 8 个根级文档/校验脚本；**八个平台目录全部在 `sealeap-amazon-skills/` 内部**，根目录没有任何平台目录。因此嵌套目录不是"多余副本"，而是本仓库唯一的技能内容根。详见第 2 节。

## 1. 平台结构与数量

| 平台 | Skills | selection | operations | advertising |
|---|---:|---:|---:|---:|
| shopify | 28 | 4 | 18 | 6 |
| etsy | 23 | 6 | 14 | 3 |
| ebay | 23 | 5 | 14 | 4 |
| tiktokshop | 22 | 4 | 13 | 5 |
| walmart | 24 | 5 | 14 | 5 |
| mercadolibre | 25 | 6 | 13 | 6 |
| ozon | 26 | 8 | 12 | 6 |
| wayfair | 24 | 6 | 12 | 6 |
| **合计** | **195** | **44** | **110** | **41** |

- 平台集合与 `validate_collection.py` 的 `PLATFORMS`、`catalog.json` 的 `platforms` 完全一致。
- 目录层级只有两层：`sealeap-amazon-skills/<platform>/<skill-name>/`，没有 amazon 仓库那种 `<source>/<creator>/<skill>` 三级结构。
- `scope`：integrated（综合入口）15 个，specialist（专项任务）180 个。`mode` 只存在于 `catalog.json`，不在 SKILL.md frontmatter 中。
- 每平台均 ≥20 个技能，每平台均覆盖 selection/operations/advertising 三种 mode（校验脚本强制要求）。

## 2. 嵌套 `sealeap-amazon-skills/` 目录判定（关键问题 a）

**结论：不是 amazon 仓库的副本/子集，而是本仓库的技能内容根（因历史原因沿用了同一目录名）。打包时必须纳入，不能排除；正确的做法是把它"拍平"，而不是丢弃。**

证据：

1. **内容不相交**：本仓库 195 个 SKILL.md 全部是 8 个非 Amazon 平台；`research/sealeap-amazon-skills` 的 602 个 SKILL.md 分布在 `amazon-skills/{amazon-official,app,bilibili,douyin,public-research,weixin,xiaohongshu,youtube}/`，platform 集合完全不同。
2. **名字 0 碰撞**：195 个 ecommerce 名字与 602 个 amazon 名字交集为 0（大小写不敏感也为 0）。
3. **内容 0 重叠**：两仓库 1099 vs 3709 个文件逐文件哈希比对，仅 **LICENSE 文本（MIT 模板）与 `assets/sealeap-logo.png`** 字节相同（66 个 amazon 文件命中这两个哈希，`SKILL.md` 哈希重合为 0）。两仓库 `sameRelPath` 只有 5 个（`.gitignore`、`assets/sealeap-logo.png`、`LICENSE`、`NOTICE`、`README.md`），且其中 NOTICE/README/.gitignore 内容并不同。
4. **文档与校验脚本把它当内容根**：根 `README.md` 的"仓库结构"明确写 `sealeap-amazon-skills/` 内含 8 平台；根 `validate_repo.py` 硬编码 `COLLECTION = ROOT / "sealeap-amazon-skills"`；`sealeap-amazon-skills/assets/catalog.json` 的 `collection` 字段就是 `"sealeap-amazon-skills"`。
5. **目录名只是沿用**：根 README 把 `sealeap-amazon-skills` 列为"亚马逊"兄弟仓库名（另一个 GitHub 项目），这里却装八大平台，属于脚手架命名遗留。根级文档（README、THIRD_PARTY_NOTICES、UPSTREAM_REVIEW、validate_repo.py、测试、logo）与嵌套根文档（README 索引、MERGE_MAP、RESEARCH*、VALIDATION、validate_collection.py、assets/）是两套互补文件，不是两份副本；唯一真重复是 LICENSE（根与内容根字节相同）。

**`MERGE_MAP.md` 说明什么**：它记录"同主题多来源合并为单入口"的方法论（如 15 个综合入口 + 专项任务），并声明"本版按平台与独立决策拆成 114 个入口"——这是**旧版（114 skills）的遗留数字**，与当前 195 不符，说明它不是清单/清单源，不能用来生成打包清单。它不含任何再分发/许可条款。

**对打包的影响**：以 `sealeap-amazon-skills/` 为内容根，去掉该层前缀即可；若保留目录名，需同步改 `catalog.json#collection`、`validate_repo.py` 和 README 链接（都对它硬编码）。把根目录当内容根会得到 0 个技能。

## 3. Frontmatter 与命名（关键问题 b）

- **键并集恰好两个**：`name`、`description`，195/195 全部同时出现，无嵌套 YAML、无 `license`/`metadata` 等其它键；两键顺序固定（name 在前）。可视为唯一必填 schema。
- `description` 为单行中文，长度 48–120 字符（中位 64），以句号结尾，通常包含"用于…；交付…；不替代…"。
- **名称唯一**：195/195 唯一，无大小写不敏感重复；`name` 与所在目录名 195/195 完全一致；满足 `^sealeap-[a-z0-9-]{1,54}$`，实际长度 23–50。
- **与 amazon 仓库碰撞：0**（见第 2 节）。两仓库可同时安装，不会出现同名 skill。
- 语言：195/195 正文为中文主导（实测 CJK 字符占比 0.671–0.922，中位 0.869，判定为 `zh-CN`），英文只出现在平台名/字段名/URL；因此 DSH 展示层需要 UTF-8 与中文 UI 字体即可，无 RTL 问题。
- 名称前缀：全部 `sealeap-<platform>-...`（shopify/etsy/ebay/tiktokshop/walmart/mercadolibre/ozon/wayfair），平台名可直接从名称第二段推得，与 `categoryPath` 一致（195/195）。

## 4. 正文约定与体积

- `bodyChars`（去掉 frontmatter 后的字符数）：最小 565、P25 596、中位 692、P75 877、P90 1008、最大 1201，合计 146,382。分布：<500 为 0，500–999 共 172，1000–1999 共 23，≥2000 为 0。即**每篇都是紧凑的短提示，无超长正文**。
- 正文结构没有唯一模板，但高频 H2 为：`任务与输入`(160)、`执行范围`(110)、`判断与交付`(109)、`执行流程`(90)、`交付`(54)、`执行`(50)、`工作流程`(40)、`当期规则与专项验收`(26)。15 个综合入口多用"交付/执行/工作流程"变体，专项任务多用四段式。
- 正文标准入口：195/195 同时链接 `references/playbook.md`（分支判断）与 `references/evidence.md`（证据与规则）；`执行范围`段声明 M（模型综合）边界、不伪造后台结果、须用户授权。
- SKILL.md 内相对链接共 **464 条，全部可解析（0 断链）**；462 条指向 `references/*`，2 条直接指向 `scripts/*.py`。统计上所有链接都是 skill 内相对路径，符合"单个 skill 可独立复制"设计。
- **绝对/机器相关路径：0 条**（Windows 盘符、`/Users/`、`/home/` 均无命中）；无个人邮箱/手机号/密钥（校验脚本会强制扫描这些模式）。
- 文件编码：全部文本 UTF-8 有效（0 个非 UTF-8）；换行全部为 **CRLF**（897 个文本文件），无混合换行。
- 无符号链接；唯一二进制是根 `assets/sealeap-logo.png`（659,818 字节）。

## 5. 支撑文件与脚本（关键问题 5）

每个 skill 目录固定为（如有额外参考/脚本则在 `references/`、`scripts/` 内追加）：

```
<skill>/
├── SKILL.md            # 唯一入口，frontmatter name+description
├── LICENSE             # MIT（3 种变体，见第 7 节）
├── agents/openai.yaml  # 接口元数据
└── references/
    ├── playbook.md     # 判读手册
    └── evidence.md     # 证据与规则
```

- 195/195 具备 `SKILL.md + agents/openai.yaml + references/playbook.md + references/evidence.md + LICENSE`，**0 缺失**；OZON 的 26 个另有 `references/mpstats.md`（全部存在）。
- `references/`：195 个目录、**466 个文件**（390 个 base + 76 个额外文件：`policy-20261016.md`×26、`mpstats.md`×26、`calculator.md`×2、`example-scenario.json`×2、其余各 1；含 5 个 .json 输入样例）。
- `scripts/`：仅 **6 个 skill** 有，共 **13 个 .py**（6 个工具 + 6 个 test + 1 个 `validate_data.py`）：
  - mercadolibre-unit-economics（unit_economics.py + test）
  - ozon-mpstats-data-audit（mpstats_read.py 只读 OZON API 探针 + validate_data.py + test）
  - tiktokshop-unit-economics（unit_economics.py + test）
  - walmart-wfs-box-reconciliation（check_box_manifest.py + test）
  - wayfair-order-multibox（check_cartons.py + test）
  - wayfair-wholesale-economics（wholesale_contribution.py + test）
  - 依赖：**纯 Python 标准库**（json/argparse/decimal/pathlib/unittest/datetime/hashlib/urllib 等，无第三方包）；除 OZON 探针外均为离线计算，不写平台账户、不访问网络；OZON 探针需显式凭证且只读。
- `agents/openai.yaml`：195/195，顶层仅 `interface`，含 `display_name`/`short_description`/`default_prompt`；`short_description` 长度 31–53（校验要求 25–64）；`default_prompt` 195/195 含 `$<skill-name>` 调用形式；`display_name` 195/195 等于 catalog 的 `title`（中文标题）。
- `assets/`（内容根下 12 个文件）：`catalog.json`(120,671B)、`source-register.json`(78,396B)、7 个 `rule-*.json`（合计 102 条规则，其中 3 个文件用 `{rules:{Rxx:...}}` object-map、4 个用数组）、3 个中文交付模板（decision/experiment/operations-template.md）。
- 每个 skill 目录文件数（不含 SKILL.md）4–10 个：4→133、5→49、6→7、7→1、8→3、9→1、10→1。
- skill 负载合计 **1,794,303 字节（占整仓 63%）**，单个 skill 平均 9.2 KB（6.6–50.0 KB，最大的含计算脚本）。

**`validate_collection.py` 检查什么**（内容根内，离线、零账户访问）：
1. `catalog.json` 与磁盘 skill 目录集合完全一致（路径+数量）；2. skill 名唯一、符合命名正则、目录名=name；3. 8 平台各 ≥20 且三种 mode 齐全；4. 必备文件（SKILL.md、agents/openai.yaml、references/playbook.md、references/evidence.md、LICENSE）齐全；5. OZON 必须 `mpstats_required=true`、有 `mpstats_reports` 与 `references/mpstats.md`，正文含 `references/mpstats.md` 与 `HOLD`；6. frontmatter name/description 匹配；7. `agents/openai.yaml` 含 `$name`、short_description 25–64；8. 规则/来源反向映射一致（rule_checks↔used_by、sources↔used_by、evidence.md 中本地引用行）；9. 所有相对链接不越出 skill 目录（可独立复制）或集合根；10. 文本扫描：`/Users/` 本地路径、邮箱、手机号、private key、凭证、token、BV 视频号、TODO/PLACEHOLDER；11. URL host 白名单 + GitHub 身份白名单；12. 无 symlink、无非 UTF-8。

**`validate_repo.py`（根）额外检查**：入口调用 `validate_collection.py` 并要求零错误；每篇 SKILL.md 长度 >400；每个 skill LICENSE 含 MIT grant；README 徽章 `Skills-195-` 与 catalog 一致；根 LICENSE 含 `Copyright (c) 2026 SeaLeap`；根 THIRD_PARTY_NOTICES 含 Nexscope MIT 全文；logo 是 PNG 魔数；全仓链接/URL/隐私模式/二进制扩展名（禁止 .pdf/.zip/.csv/.xlsx/.mp4）。

**`test_policy_refresh_validation.py`**：8 个负向回归用例（在隔离临时副本上改 catalog/rule 后要求校验失败），验证"无来源不得自称官方依据、未登记规则不算官方来源、索引摘录不能冒充正文、反向映射必须一致"等证据边界。属于开发期测试，不是运行时依赖。

## 6. `catalog.json` 与资产索引（关键问题 6）

- 位置：`sealeap-amazon-skills/assets/catalog.json`（**不在仓库根**），`schema_version: 3`，`collection: "sealeap-amazon-skills"`，`edition: "2026-10-16-policy-refresh"`。
- 顶层：`schema_version, collection, edition, platforms, skills`；`platforms` 是 8 元素数组（顺序 shopify/etsy/ebay/tiktokshop/walmart/mercadolibre/ozon/wayfair）。
- 条目字段（并集）：`name, platform, mode, title, path, sources, rule_checks, merged_topics, topic_reference, scope, updated_on, execution, edition_added, mpstats_required, mpstats_reports, evidence_basis`。`path` 是相对**内容根**的路径（如 `shopify/sealeap-...`），与磁盘 195/195 精确匹配（已实测：双向差集=0）。
- 分布：共 195 个条目；`mode` 44/110/41；`scope` 15/180；`edition_added` 7 个批次；`merged_topics` 合计 680；`topic_reference` 13 个；`mpstats_required=true` 26 个；`execution` 仅 3 个条目为对象（`sealeap-tiktokshop-unit-economics`、`sealeap-wayfair-wholesale-economics`、`sealeap-wayfair-order-multibox`，字段含 runtime/entrypoint/input_example/reference/tests/network/account_mutations），其余 192 个无该键。
- `source-register.json`：schema 3、**81 个来源**（created 2026-09-23、edition v8），含 `used_by` 反查；`rule-*.json` 合计 **102 条官方规则**（array 55 + object-map 47，混合结构），每条含 checked_on/url/read_scope/coverage/limitations/used_by 等。
- **权威性**：磁盘目录结构 + catalog 双向一致；`validate_repo.py` 的 README 徽章一致性检查把 catalog 当数量真源。故打包应以 `catalog.json` + 磁盘为准，不要用 MERGE_MAP（旧 114）或任何 RESEARCH 文档计数。

## 7. 许可证与再分发义务（关键问题 c）

- 两层 LICENSE 均为 MIT（`Copyright (c) 2026 SeaLeap`），根 LICENSE 与内容根 LICENSE **字节相同**（22 行），全仓每个 skill 的 LICENSE 也含 MIT permission grant。
- **每个 skill 的 LICENSE 有 3 种变体（不可盲目去重）**：
  - 108 个：仅 `Copyright (c) 2026 SeaLeap`；
  - **85 个：SeaLeap + `Copyright (c) 2026 Nexscope AI`**（上游 eCommerce-Skills 的 MIT 归属，随包保留）；
  - **2 个：SeaLeap + `Copyright (c) Meta Platforms, Inc. and its affiliates.`**（Robyn 方法参考；`sealeap-shopify-mmm-data-readiness`、`sealeap-shopify-marginal-budget-review`）。
- `THIRD_PARTY_NOTICES.md`（根）载明：Nexscope AI `eCommerce-Skills`（研究提交 `ee0fb29433d02ccc22e3e6cea9ab4586d49fd42e`）MIT 全文 + Meta Robyn MIT 全文 + SeaLeap Logo 来自 SeaLeap 自己的 MIT 仓库；声明"原社媒内容未再分发；个人身份继续脱敏；MIT 要求的公开组织署名不删除"；并声明上游的营销/固定收益/过时费用/控制项不作为本集合规则。
- `NOTICE`（根与内容根各一份，内容不同）：原创整理采用 MIT；第三方文章/音视频/截图/商标/课程权利不因提炼或匿名化转移；SeaLeap 独立维护，**不代表 8 平台及 MPstats 官方授权/认证/背书**；来源互动不证明经营效果。
- `UPSTREAM_REVIEW.md`：上游 `nexscope-ecommerce-skills` 为专有软件（140 个 SKILL.md、无根 LICENSE），**未导入**；仅导入 MIT 的 `eCommerce-Skills`（162 SKILL.md 中筛选 149 个、映射 98 个文件到 85 个专项任务）。
- **再分发义务清单**：① 随分发保留根 `LICENSE`、`NOTICE`、`THIRD_PARTY_NOTICES.md`；② 保留每个 skill 目录内 LICENSE（尤其 85 个 Nexscope、2 个 Meta 变体）；③ 保留 SeaLeap/Meta/Nexscope 版权与 MIT 声明，不得以"MIT 全仓"为由删去第三方署名；④ 不得声称平台官方背书；⑤ 原始文章/视频/商标权利不随本仓库转移（本仓库本身已不含原文、逐字稿、截图、凭证、个人来源映射）。满足以上即可作为 MIT 衍生作品再分发（含商业用途）。

## 8. 打包建议与坑（关键问题 7）

**推荐映射（DSH plugin）**：

```
plugin-root/
├── LICENSE                     # SeaLeap MIT（根，必须）
├── NOTICE                      # 非官方背书声明（必须）
├── THIRD_PARTY_NOTICES.md      # Nexscope/Meta MIT 全文（必须）
├── skills/
│   ├── sealeap-shopify-unit-economics/
│   │   ├── SKILL.md  LICENSE  agents/openai.yaml  references/...  (scripts/)
│   └── ...195 个
└── (可选) catalog.json / platform 索引（重写 path 前缀）
```

- 内容根 = `sealeap-amazon-skills/`，**拍平**：去掉前缀与平台层级或保留 `skills/<platform>/<name>/`（均不破坏 skill 内相对链接）；`catalog.json#path` 是相对内容根的 `<platform>/<name>`，若改布局需同步重写。
- 每个 skill 复制：`SKILL.md`、`LICENSE`、`agents/openai.yaml`、`references/`、`scripts/`（有则带），保留相对结构即可独立移植（仓库校验明确要求"skill 不依赖集合内其它目录"）。
- 可排除（仓库级开发物）：`validate_collection.py`、`validate_repo.py`、`test_policy_refresh_validation.py`、`.gitignore`、`RESEARCH*.md`、`VALIDATION.md`；`MERGE_MAP.md` 若作文档需接受其"114 个入口"旧计数（根 README 已更新为 195）。根 `assets/sealeap-logo.png`（660 KB）仅在需要图标时带上并保留 SeaLeap MIT 署名。
- 元数据可来源：frontmatter（name/description）、`agents/openai.yaml`（display_name/short_description/default_prompt，含 `$name` 调用约定，DSH 侧需换成自己的 agent 提示格式）、`catalog.json`（platform/mode/title/scope/execution/mpstats）。
- 索引可只带 195 条精简清单（name+platform+relPath），不带 catalog 全文（120 KB）也能工作。

**坑（按优先级）**：

1. **嵌套目录误判**：把 `sealeap-amazon-skills` 当"amazon 副本"排除 → 丢失全部 195 个技能；把仓库根当内容根 → 也得到 0 个技能。必须先拍平该层。
2. **LICENSE 去重**：3 种变体（85 Nexscope / 2 Meta）是再分发义务，不能统一替换成 SeaLeap MIT。
3. **计数真源**：MERGE_MAP 写 114、README 写 195、catalog 195、磁盘 195；以 catalog+磁盘为准，文档计数已过时。
4. **路径前缀**：`catalog.json#path` 与 `catalog.collection` 隐含 `sealeap-amazon-skills`；改名/拍平后要同步，否则校验与文档链接断裂。
5. **二进制/体积**：唯一二进制是 660 KB logo（占全仓 23%），skill 负载仅 1.79 MB；不要把它塞进每个 skill。
6. **脚本运行时**：6 个 skill 带 Python（纯标准库，3.9+，含单测）；若 DSH 侧不执行脚本可只当参考，但 `execution` 字段与 SKILL.md 中的 `scripts/*.py` 链接需保留有效。
7. **OZON 数据前置条件**：26 个 OZON skill 以 MPstats 为必需输入并含 HOLD 门，属运行期要求而非打包问题；不满足时应输出数据需求而非伪造结果。
8. **换行/编码**：全仓 CRLF、UTF-8、无 BOM；若生成器按 LF 规范化需保持一致（无编码风险文件）。
9. **无 symlink/绝对路径/隐私数据**：可直接安全复制；无需脱敏后处理（校验脚本已强制）。
10. **与 amazon 插件共存**：名称/内容均无碰撞（0），但两者都有 `sealeap-` 前缀，建议插件级命名空间/ID 区分（如 `sealeap-ecommerce` vs `sealeap-amazon`），避免安装器把 skill 目录混装。
11. **不要按"合并主题"删 skill**：15 个 integrated 与专项重叠是 MERGE_MAP 的设计（多环节评审入口），不是重复项，删了会破坏 README 索引与 catalog 一致性。

## 9. `docs/inventory/ecommerce.json` 数据字典

顶层：`generatedAt`（+08:00 ISO）、`repo`、`repoCommit`（全 40 位）、`repoCommitDate`、`contentRoot`（`sealeap-amazon-skills`）、`skillCount`（195）、`platforms`（8，catalog 顺序）、`platformCounts`、`nameCollisionsWithAmazonRepo`（`{amazonSkillCount:602, collisions:[]}`）、`skills`。
每条 skill：
- `name`：frontmatter name / 目录名（195/195 一致）；
- `relPath`：相对克隆根、含内容根、正斜杠、无尾斜杠；
- `categoryPath`：内容根以下的分类段数组（本仓库即 `["<platform>"]`）；
- `description`：frontmatter 原文（去 YAML 引号）；
- `frontmatterKeys`：按出现顺序的顶层键（本仓库恒为 `["name","description"]`）；
- `lang`：正文 CJK 占比判定（本仓库 195 个均为 `zh-CN`）；
- `hasReferences`/`hasScripts`/`hasAgents`：对应子目录存在且 ≥1 文件（195/6/195）；
- `assetFileCount`：skill 目录内除 SKILL.md 外的文件数（含 LICENSE、agents/openai.yaml、references/*、scripts/*），范围 4–10；
- `bodyChars`：frontmatter 之后正文字符数（565–1201）。

与 amazon 分析（`docs/inventory/amazon.json`）字段语义一致（categoryPath 为数组、relPath 含内容根），两份清单可直接合并。

## 10. 结论速览

- 195 skills / 8 平台 / 1099 文件 / 2.84 MB；skill 负载 1.79 MB，正文短小（中位 692 字符）。
- 嵌套 `sealeap-amazon-skills/` **不是** amazon 副本，而是内容根（命名遗留）；**必须纳入并拍平**。
- frontmatter 仅 `name` + `description`；名称唯一、与 amazon 仓库 0 碰撞；全中文、全 UTF-8、CRLF、无绝对路径、无 symlink、仅 1 个二进制。
- 许可：全仓 MIT（SeaLeap），但 85 个技能包携 Nexscope AI MIT、2 个携 Meta Robyn MIT；再分发须保留根 LICENSE/NOTICE/THIRD_PARTY_NOTICES 及每 skill LICENSE。
- 打包真源：磁盘 + `assets/catalog.json`（路径相对内容根，已验证 195/195 一致）；MERGE_MAP 的 114 是旧版残留。
