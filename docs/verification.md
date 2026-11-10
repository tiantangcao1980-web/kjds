# SeaLeap 技能库 → DeepSeek Harness 插件：交付与验证报告

日期：2026-11-06
工作区：本仓库根目录

## 结论

两个仓库已分别打包成两个独立的 DSH 插件，已安装、已启用，并在当前会话中实测可用：

| 插件包 | 技能数 | 体积 | 工具 | 入口技能 |
|---|---|---|---|---|
| `@local/sealeap-amazon-skills` | 602 | 19.4 MB / 3719 文件 | `sealeap_amazon` | `sealeap-amazon-knowledge` |
| `@local/sealeap-ecommerce-skills` | 196 | 2.3 MB / 1115 文件 | `sealeap_ecommerce` | `sealeap-ecommerce-knowledge` |

## 交付物位置

| 内容 | 路径 |
|---|---|
| 插件源码 | `plugin-src/` |
| 打包脚本 | `plugin-src/scripts/pack.mjs` |
| 已安装的 amazon 插件 | `~/dsh-plugins/sealeap-amazon-skills/` |
| 已安装的 ecommerce 插件 | `~/dsh-plugins/sealeap-ecommerce-skills/` |
| 原始仓库（浅克隆） | `research/sealeap-amazon-skills/`、`research/sealeap-ecommerce-skills/`（需自行克隆，不随仓库发布） |
| 仓库分析报告 | `docs/analysis-amazon.md`、`docs/analysis-ecommerce.md` |
| 技能清单（机器可读，生成产物，不随仓库发布） | `docs/inventory/amazon.json`、`docs/inventory/ecommerce.json` |
| 设计文档 | `docs\superpowers\specs\2026-11-06-sealeap-skills-dsh-plugins-design.md` |
| 实施计划 | `docs\superpowers\plans\2026-11-06-sealeap-skills-dsh-plugins.md` |
| API 文档变更跟踪脚本 | `plugin-src/scripts/watch-apis.mjs` |
| API 跟踪基线与报告 | `docs/api-watch/`（`state.json`、`reports/`；运行数据不随仓库发布） |

## 设计要点（为什么不是「把 797 个技能全注册」）

- 两个库共 797 个技能，光 description 就 175,799 字符 ≈ 137k tokens。全部注册为模型可见技能会直接压垮会话上下文预算。
- 因此采用 **「1 个入口技能 + 1 个检索工具」**：模型只多看到 2 条技能描述，实际检索通过工具按需进行，命中后 `read` 读正文、`file` 读 references/scripts。
- 技能文件按原仓库目录树原样打包（不拍平），相对链接全部保留；正文读取时剥离 frontmatter、正文上限 20000 字符；`file` 上限 256 KB 并拒绝目录穿越（绝对路径 / `..` / 盘符）。
- 检索打分：名称 6 分、标题 4 分、描述 3 分、分类 2 分、标签 2 分；ASCII 词用词边界匹配，中文按子串计数。
- ecommerce 包额外用 `assets/catalog.json` 补 platform/mode 标签，并排除开发产物（`RESEARCH*`、`VALIDATION.md`、`validate_*.py`），保留 LICENSE / NOTICE / THIRD_PARTY_NOTICES 及每技能各自的 LICENSE 变体。

## 安装状态证据

`~/.dsh/profiles/<profile>/package.json`：

```json
"dependencies": {
  "@local/sealeap-amazon-skills": "link:<DSH_PLUGINS_DIR>/sealeap-amazon-skills",
  "@local/sealeap-ecommerce-skills": "link:<DSH_PLUGINS_DIR>/sealeap-ecommerce-skills"
},
"dsh": { "profile": { "bundles": [ "...", "@local/sealeap-amazon-skills", "@local/sealeap-ecommerce-skills" ] } }
```

`plugin_manager list_bundles` 中两项均为 `enabled: true, installed: true`，`source: link:...`，热加载生效（无需重启应用）。

## 测试证据

每个包内置 24 个单元测试 + 12 个集成测试，在包目录内 `node --test` 运行：

```
sealeap-amazon-skills:     # tests 36  # pass 36  # fail 0
sealeap-ecommerce-skills:  # tests 36  # pass 36  # fail 0
```

（先写过失败测试再实现：隐藏 `lib/` 时集成测试以 `ERR_MODULE_NOT_FOUND` 失败，RED 已确认。）

## 实机调用证据（当前会话真实工具调用）

- `sealeap_amazon search "ACOS 诊断"` → 首条 `sealeap-amazon-acos-diagnostics`，另有 `acos-conversion-diagnostics`、`qinglong ad-diagnostics`。
- `sealeap_amazon read sealeap-amazon-acos-diagnostics` → 返回 9305 B 正文（已剥离 frontmatter）+ 11 个同目录文件清单。
- `sealeap_amazon file references/diagnostic-tree.md` → 返回完整 3242 B 参考文件。
- `sealeap_ecommerce search "eBay 广告归因"` → 首条 `sealeap-ebay-ad-attribution`（mode advertising），次条 `sealeap-ebay-advertising`。
- `sealeap_ecommerce search "Ozon 选品"` → `sealeap-ozon-ad-readiness`、`sealeap-ozon-assortment-extension`、`sealeap-ozon-attribution-audit`。
- `sealeap_ecommerce list` → 195 个技能，8 个平台分类计数正确。

## 第二轮（检索质量与易用性完善）

### 问题与根因（实测）

- 中文整句零命中：`queryTerms` 只按空格切词，`新品怎么推`、`账号被封了怎么办` 这类无空格中文句几乎检索不到；实测 amazon 10 条问题中 4 条零命中、ecommerce 8 条中 5 条零命中。
- `shortDescription`（中文短描述）没有进入检索字段。
- 两个入口技能描述近乎相同，模型难以判断该用哪个库。
- `list` 只能看分类计数，无法下钻；`file` 遇到超过 256 KB 的文件直接报错。

### 改动

1. 分词（`lib/text.js`）：中文按连续片段 + 重叠二元组切分，ASCII 词整词保留；中文停用词（怎么/怎么办/如何/什么/的/了…）先剥离；`被` 不剥离，保证「被封」可命中；全角标点按分隔符处理。
2. 检索（`lib/search.js`）：`shortDescription` 权重 5（name 6 / title 4 / description 3 / category 2）；每个字段内同一词最多计 3 次，防止重复堆分；新增中英同义词桥（选品↔product research、广告↔ads/ppc、转化率↔conversion、被封↔suspension…），中文二元组内出现同义词键时同样桥接（修正「提高转化率」）。
3. 入口技能描述按库区分：亚马逊库写明「亚马逊站内运营 + 8 类来源」，电商库写明「8 个平台 + 亚马逊站内问题请优先用亚马逊技能库」，均带 `CONFIG.scope/audience/exclusion`。
4. `list` 支持 `category` 下钻（返回该分类技能清单，含子分类计数，最多 60 条，超出标注）。
5. `file` 改为超长截断：读取上限 2 MB，正文截断到 40000 字符并注明「已截断」；二进制文件明确拒绝。
6. `read` 只按精确名/忽略大小写匹配；未命中时返回相近技能名，避免静默读到错误技能。

### 测试（包内 `node --test`）

```
sealeap-amazon-skills:     # tests 62  # pass 62  # fail 0  # skipped 0
sealeap-ecommerce-skills:  # tests 60  # pass 60  # fail 0  # skipped 0
```

- 新增 `test/golden-{amazon,ecommerce}.json` 黄金集：10 条亚马逊真实问题 + 8 条跨平台真实问题，断言「无零命中」且前三名命中期望技能或概念正则。
- 新增集成测试：分类下钻、未知分类报错、超长文件截断渲染、入口描述包含本库范围。

### 实机复验（当前会话真实工具调用）

- `sealeap_amazon search "新品怎么推"` → `hundun launch-review-rank-playbook`、`yingzhao conversion-gated-ppc-launch`、`bifang new-product-ad-conversion-first`（改前零命中）。
- `sealeap_amazon search "账号被封了怎么办"` → `luduan social-ad-account-appeal`、`dijiang seller-account-registration`、`zhuque ad-diagnostics-linkage`（改前零命中）。
- `sealeap_ecommerce search "库存积压怎么清"` → `mercadolibre-full-inventory-aging`、`shopify-inventory-replenishment`、`walmart-inventory-planning`（改前零命中）。
- `sealeap_amazon list category="douyin"` → `分类 douyin：211 个技能（子分类：pixiu:35，xiezhi:35，qilin:34，baize:33，yinglong:31，zhuque:23，qinglong:20）`，列前 60 条并提示可加 `search`+`category` 缩小。
- `sealeap_amazon file` 读 `sealeap-amazon-prime-day-planning` 的 `references/prime-day-insights-2025.csv`（50994 B）→ 返回前 40000 字符 + 「文件共 50994 字节，已截断为前 40000 字符」。

## 第三轮（检索排序质量：IDF + 概念覆盖 + 同义词扩充）

### 问题与根因（实测 89 条真实运营口语问题：amazon 60 + ecommerce 29）

- 零命中已基本消除（第二轮），但命中质量不稳：常见词（广告、库存）把结果拉向错误主题，稀疏但有区分度的词（商标、转化率、独立站）没有主导排序。
- 典型错误首条：「商标怎么注册」→ 卖家账号注册、「转化率怎么提高」→ 运营复盘、「etsy SEO」→ Shopify 技术 SEO、「独立站广告」→ 美客多广告组。
- 同一问题里出现两个概念的句子（如「清关 仓储」）排序不如单概念重复出现的技能。

### 改动

1. `lib/search.js` 新增 `inverseDocumentFrequency(df, total) = Math.log((total + 2) / (df + 1)) + 0.3`，在过滤后的候选集上按词统计 df，`weighted = term.weight * idf`：满库词（广告、库存、运营）几乎失去区分度，稀有词（商标、清关、二审）主导排序。
2. 新增 `COVERAGE_BONUS = 0.3`：`scoreParts()` 返回 `{score, matched}`（命中的不同查询词数），最终排序键 `score * (1 + 0.3 * max(0, matched - 1))`，让「同时命中两个概念」压过「同一个词重复出现」。
3. `SYNONYMS` 扩充约 45 组口语同义词：二阶→second review/account review/verification/appeal、跟卖→hijacker/hijacking、清关→customs/clearance、头程→first leg/freight、长期仓储费→long-term storage、独立站→shopify/dtc/storefront、佣金→commission/fee、上架→listing/publish、入驻→onboarding/registration、侵权→infringement/ip complaint、归因→attribution、直播→livestream 等；中文二元组包含同义词键时同样桥接。
4. `lib/text.js` 停用词补充中性动词（避免、解决、应对、求助、推荐、建议、最好、最近、平时、一般、现在、到底、具体、相关、问题、情况…），避免「长期仓储费怎么避免」被中性词带偏。
5. `index.js` 的 `read`/`file` 只做精确名匹配，未命中时返回相近技能名（不再静默搜索兜底命中错误技能）。

### 测试（包内 `node --test`）

```
sealeap-amazon-skills:     # tests 83  # pass 83  # fail 0  # skipped 0
sealeap-ecommerce-skills:  # tests 71  # pass 71  # fail 0  # skipped 0
```

- 黄金集扩到 26 条 amazon + 14 条 ecommerce（`test/golden-*.json`），每条断言「无零命中」且前三名命中期望技能名或概念正则；新增条目覆盖蓝海、市场容量、利润、点击率、购物车、秒杀、站外、季节性、排名、头程、补货、断货、视频认证、二审、商标、品牌备案等。
- 源目录（未打包）`node --test`：`# tests 43 # pass 41 # fail 0 # skipped 2`（2 个 skip 是需要生成文件的集成/黄金测试）。
- 评测脚本（89 条）本轮跑完后已删除，不随包发布。

### 实机复验（当前会话真实工具调用，重新打包并热重载后）

- `sealeap_amazon search "商标怎么注册"` → `zouwu brand-registry-enroll` 第一（改前是 seller-account-registration）。
- `sealeap_amazon search "转化率怎么提高"` → `xiezhi conversion-rate-prelaunch-estimation`、`bifang ad-rank-conversion-balance`、`dijiang conversion-rate-keyword-filter`（改前是运营复盘类）。
- `sealeap_amazon search "二审怎么过"` → `baxia video-verification-readiness` 进入前三（库内无专门「二审」技能，属数据缺口）。
- `sealeap_ecommerce search "独立站广告怎么投"` → `shopify-advertising` 第二；`"walmart 怎么上架"` → `walmart-listing-quality` 第一。
- 改代码后需让插件重新加载才生效：对 `plugin_manager` 的 `include:sealeap-amazon-skills` / `include:sealeap-ecommerce-skills` 先 `set_plugin enabled=false` 再 `enabled=true`（每次开关后技能目录会重算），或重启 DSH。

## 第四轮（补充 OZON 官方 API 文件 · 本地产物未随仓库发布）

> 说明：本轮产物（`plugin-src/extras/`、`research/ozon-api/`）依赖无明确许可的第三方镜像，仅保留实现记录，不随仓库发布。

### 需求与判断

用户要求「完成 OZON API 文件的补充」。库内 26 个 OZON 技能全部以 MPstats/HOLD 等 MCP 数据源为前提，没有一处讲官方 Seller API / Performance API 怎么调；本轮补的就是这一层「怎么调」。

形式选「纯文档」：新增一个技能 + references 端点索引，不改检索工具代码，也不做真实 API 调用（插件不保存凭据、不代发请求）。

### 端点数据从哪来

- `https://docs.ozon.ru/api/seller/` 在本机无法直连：curl 返回 307 挑战循环（重定向到 `?__rr=N`），带浏览器 UA 也一样；`https://api-seller.ozon.ru/` 返回 403。因此不能直接抓官方 swagger。
- 改用开源镜像 `MissiaL/ozon-api`（内含官方 OpenAPI 快照）：Seller `4,350,842 B`（483 paths）、Performance `319,140 B`（47 paths / 48 operations），快照日期 **2026-10-18**，已存到本地 `research/ozon-api/`（不随仓库发布）。
- 该镜像**没有 license**，因此只提取事实性接口数据（method、path、tag、官方俄文摘要、请求体顶层必填字段、deprecated 标记），不搬运其解释文字与代码。

### 新增内容

源码在 `plugin-src/extras/ecommerce/ozon/sealeap-ozon-seller-api/`，打包时合并进 ecommerce 插件的 `skills\ozon\`。

| 文件 | 内容 | 大小 |
|---|---|---|
| `SKILL.md` | 什么时候用/不用、两个 API 分清、认证、调用范式、限流、错误码（gRPC 码 vs HTTP）、安全红线（生产店铺无沙箱）、按任务选域表、常见任务配方、无凭据降级 | 8,436 B |
| `references/auth.md` | Seller `Client-Id`+`Api-Key` 三头、密钥角色与 3 个月有效期、`/v1/roles` 核对；Performance OAuth2 `client_credentials` 换 token（`expires_in` 1800） | 2,639 B |
| `references/conventions.md` | 全 POST、空 body `{}`、三种商品 ID、snake_case、RFC3339、分页差异、限流（50 rps、analytics 1 次/分 + 非 Premium 50/天、Performance 100k/天）、错误映射、版本迁移提醒、写入前确认 | 4,483 B |
| `references/performance.md` | 广告 API 认证、`/api/client/` 路径、统计异步 UUID→轮询→报告、配额、与广告业务技能分工 | 2,621 B |
| `references/index.md` | 8 个业务域索引（域 → 文件 → 端点数 → 何时用） | 1,327 B |
| `references/endpoints-*.md` ×8 + `endpoints-performance.md` | 483 + 48 个端点速查清单，全部小于 40,000 字符，可用 `file` 一次读完 | 见下表 |
| `references/source.md` | 来源、快照日期、提取边界、为何不直连、重建命令 | 2,187 B |
| `agents/openai.yaml` | 展示名「OZON 官方 API 接口速查与调用」+ 中文简介（提升检索权重 5 的命中） | 428 B |

| 域文件 | 端点数 | 大小 |
|---|---|---|
| `endpoints-products.md`（商品/类目/条码/品牌/通行证/数字商品/认证/价格库存/价格策略） | 81 | 11,137 B |
| `endpoints-fbs.md`（FBS/rFBS 包裹、面单、发运、取消、承运） | 87 | 12,811 B |
| `endpoints-fbo.md`（FBO 供货、仓库、运输、供货计划） | 108 | 17,673 B |
| `endpoints-returns.md`（退货与退款） | 15 | 2,526 B |
| `endpoints-promos.md`（促销、卖家活动） | 38 | 6,640 B |
| `endpoints-reports.md`（报表、财务、发票、分析、评分） | 41 | 5,757 B |
| `endpoints-engagement.md`（评价、问答、聊天、通知） | 30 | 4,027 B |
| `endpoints-platform.md`（账号、密钥角色、Ozon 配送、FBP 草稿） | 83 | 13,830 B |
| `endpoints-performance.md`（广告活动、统计、出价） | 48 | 6,381 B |

端点行格式：`` - `POST /v1/product/archive` — Перенести товар в архив【必填：product_id】 ``，废弃端点带 ⚠️已废弃。

### 构建与打包

- `plugin-src\scripts\build-ozon-api.mjs`：从 `research\ozon-api\*.json` 生成上述 9 个端点文件与 `index.md`（未映射的 tag 直接报错，避免静默丢端点）。
- `plugin-src\scripts\pack.mjs`：ecommerce 规格新增 `extrasRoot`，在上游内容树拷贝之后合并本地维护技能，保持克隆目录干净；`expectedSkills` 改为 196。

### 测试

- 包内 `node --test`：`# tests 74 # pass 74 # fail 0`（原 71 + 2 条 OZON API 黄金查询 + 1 条集成测试）。
- 新增集成测试断言：`sealeap-ozon-seller-api` 的 ≥9 个 `references/endpoints-*.md` 都能被 `file` 一次读完（`truncated !== true`）且含端点行，`index.md` 可读。
- 检索：`OZON API 怎么查商品信息`、`ozon seller api 库存怎么改`、`ozon api 认证`、`OZON 广告统计接口怎么拉` 四条查询 top1 均为 `sealeap-ozon-seller-api`，无零命中。

### 实机复验（重新打包并热重载后）

- `sealeap_ecommerce search "OZON API 怎么查商品信息"` → 第一 `sealeap-ozon-seller-api`。
- `sealeap_ecommerce read "sealeap-ozon-seller-api"` → 正文 + 16 个同级文件清单（SKILL.md、agents、11 个 references）。
- `sealeap_ecommerce file ... references/endpoints-products.md` → 一次返回 81 个端点（11,137 B，未截断）。

### 重建

```bash
node plugin-src/scripts/build-ozon-api.mjs   # 重写 extras 下的端点文件与 index.md
node plugin-src/scripts/pack.mjs ecommerce   # 合并进插件包（196 个技能）
```

更新快照时替换 `research/ozon-api/` 的两个 JSON，改脚本里的 `SNAPSHOT_DATE`，再跑上面两条命令。

### 边界

端点清单基于 2026-10-18 的镜像快照；每周自动跟踪任务发现变化时会重新抓取、重建并重打包，文件内的「抓取日期」会随重建更新（当前 2026-11-06）。只带路径、摘要、必填字段与废弃标记，不含完整请求/响应 schema；不代发请求、不保存凭据。涉及停用日期、字段改名（如 `total` → `total_items`）或写入真实店铺前，需对照官方文档复核。

## 第五轮（API 文档变更跟踪：9 个周任务）

- 需求：跟踪 OZON 及同类平台 API 文档是否更新，每周一次；发现变化时出报告并自动更新端点清单。
- 实现：`plugin-src/scripts/watch-apis.mjs`（Node ESM，无新增依赖），9 个平台注册在同一张表里：
  - 指纹类型：OpenAPI JSON（paths / operations / tags / sha）、仓库 HEAD（`git ls-remote`）、GitHub HTML 树页解析出的目录/文件名清单、文档页版本标识（`20xx-xx`、`vN`）。
  - 基线：`docs/api-watch/state.json`；报告：`docs/api-watch/reports/<YYYY-MM-DD>-<平台>.md`；Amazon 模型清单暂存：`docs/api-watch/staged/amazon-spapi-models.md`。
  - 命令：`node plugin-src\scripts\watch-apis.mjs`（全部检查，只出报告）、`--platform ozon --publish`（变化时自动重建发布）、`--init`（重建基线）、`--dry-run`（不写盘）。
  - 退出码：0 正常；1 有必选来源不可达；2 自动发布失败。

### 平台与数据源（实测可达性）

| 平台 | 内容库 | 跟踪方式 | 实测 |
|---|---|---|---|
| Ozon | ecommerce | Seller/Performance OpenAPI JSON（raw 镜像）+ 镜像 HEAD | 4,350,842 B / 483 paths；319,140 B / 47 paths / 48 ops |
| Amazon SP-API | amazon | 官方仓库 HEAD + `models` 目录树 | HEAD `db2936aa19f4`，57 个模型目录 |
| Shopify | ecommerce | Admin REST 与 release-notes 页面版本标识 | 200，含 2024-xx…2026-xx 版本串 |
| Walmart | ecommerce | 开发者站版本标识 | 200（2.6 MB） |
| eBay | ecommerce | 镜像 OAS specs 目录 + 镜像 HEAD（官方概览页可选） | specs 目录可达 |
| Etsy | ecommerce | 镜像 3.0.0 spec JSON + 镜像 HEAD（官方文档页可选） | spec 可达；etsy.com 本机不可达 |
| TikTok Shop | ecommerce | docv2 页面版本标识 | 200 |
| Mercado Libre | ecommerce | 开发者站版本标识 | 200 |
| Wayfair | ecommerce | 开发者站版本标识 | 200 |

### 为什么不用 GitHub REST API

未认证的 api.github.com 只有 60 次/小时。开发期连续验证时被限流（`remaining: 0`，`--init` 只能播下一半来源）。改为 `git ls-remote`（HEAD sha，不限流）+ GitHub HTML 树页解析（`/"name":"…"/g`，不限流），9 平台全部来源可稳定取得。

### 自动发布（仅 Ozon）

检测到变化 → 写回 `research/ozon-api/*.json` → 改写 `build-ozon-api.mjs` 的 `SNAPSHOT_DATE` → 重建 9 个 references → 刷新 `source.md` 的抓取日期与端点计数 → 重打包 ecommerce（196 技能）→ 在包目录跑 `node --test`。实测发布一次：`tests 74 / pass 74 / fail 0`，打包 `{"ok":true,"skills":196,"categories":8}`，`source.md` 日期与构建脚本 `SNAPSHOT_DATE` 均更新；发布后需在插件面板重载 ecommerce 插件（或重启 DSH）。其他平台保留人工核对入口，不做自动改写。

### 周任务

每周一（Asia/Shanghai）错峰运行 9 个任务，每个任务在新会话里执行一次对应平台检查并把中文结论回报：

| 时间 | 任务 |
|---|---|
| 09:00 | Ozon Seller API |
| 09:05 | Amazon SP-API |
| 09:10 | Shopify Admin API |
| 09:15 | Walmart Marketplace API |
| 09:20 | eBay Sell API |
| 09:25 | Etsy Open API |
| 09:30 | TikTok Shop API |
| 09:35 | Mercado Libre API |
| 09:40 | Wayfair API |

（这些是本机个人工作流里的定时任务，不随仓库发布。）

### 局限

`docs.ozon.ru` 有反爬挑战，Ozon 端点清单来自开源镜像里的官方 OpenAPI 快照，非官方授权、可能滞后；etsy.com 在本机网络不可达，只能靠镜像 spec；Shopify / Walmart / TikTok Shop / Mercado Libre / Wayfair 没有可信的机器可读 spec，只能跟踪文档页版本标识，发现变化后需人工核对；eBay 同样依赖社区镜像。

## 使用方式

1. 直接提问业务问题（选品 / Listing / 广告 / 库存 / 合规 / 申诉 / 利润 / 多站点…），入口技能会触发，模型先调检索工具再读技能正文执行。
2. 也可显式要求：`用 sealeap_amazon 查 ACOS 诊断技能`。
3. `action="list"` 看分类、`action="list" category="shopify"` 下钻到该分类技能清单；`action="search"`（可加 `category` 限定分类，如 `amazon-official`、`shopify`、`ozon`）；`action="read"` + `name` 读正文与文件清单；`action="file"` + `name` + `file` 读指定引用文件（超长自动截断）。

## 离线降级

原技能有大量依赖 MCP / 凭据（sorftime、sellersprite、keepa、apify、SIF；OZON 系需 MPstats + HOLD）。插件内入口技能明确要求：无凭据时先说明缺什么、给出补数路径，不得编造数据或伪造工具结果。

## 清理与移除

- 临时验证用的 `@local/sealeap-probe` 已彻底清理（profile 依赖、bundles、node_modules 联接、源目录 `~/dsh-plugins/sealeap-probe` 均已移除）。
- 需要停用/卸载本插件：`plugin_manager` 的 `set_plugin`（enabled=false）或 `remove_bundle`（目标 `@local/sealeap-amazon-skills` / `@local/sealeap-ecommerce-skills`）。重新打包：`node plugin-src\scripts\pack.mjs amazon`（或 `ecommerce`），再重装。
