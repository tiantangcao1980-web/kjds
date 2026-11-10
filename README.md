# KJDS · SeaLeap 技能库的 DeepSeek Harness 插件 + 运营内核

把 [SeaLeap 亚马逊技能库](https://github.com/xjli360/sealeap-amazon-skills)（602 个技能）和
[SeaLeap 跨平台电商技能库](https://github.com/xjli360/sealeap-ecommerce-skills)（195 个技能）
打包成 [DeepSeek Harness](https://github.com/deepseek-ai)（DSH）插件，并抽出一个平台无关的运营系统内核 `ops-core`。

## 为什么这样做

797 个技能的 `description` 合计约 17.6 万字符（≈13.7 万 token）。DSH 会把每个模型可见技能的名称与描述写进会话系统提示，
**全部注册为原生技能会直接压垮上下文预算**。所以每个插件只注册 **1 条入口技能**，其余技能通过 **1 个检索工具**按需发现：

| 层 | 内容 | 上下文成本 |
|---|---|---|
| 入口技能 | `sealeap-amazon-knowledge` / `sealeap-ecommerce-knowledge`：什么时候检索、工具怎么调、读到后怎么执行 | 固定 2 条 |
| 检索工具 | `sealeap_amazon` / `sealeap_ecommerce`：`search` / `list` / `read` / `file` | 恒定 |
| 技能正文 | 命中后读 `SKILL.md`（剥离 frontmatter）与 `references/`、`scripts/` | 按需 |

技能文件按上游仓库目录树原样打包（不拍平），相对链接全部保留；无凭据 / 无 MCP 时入口技能要求给出流程与补数路径，不编造数据。

## 仓库结构

```
.
├── ops-core/                 # 跨平台运营内核（纯 ESM，零运行时依赖）
│   ├── src/                  # config / db / http / alerts / report / actions / images / secrets / monitor
│   ├── test/                 # node --test
│   └── examples/demo.mjs
├── plugin-src/               # DSH 插件源码（两个包共用）
│   ├── index.js              # cordis 插件：注册 skill provider + 检索工具
│   ├── lib/                  # text（分词/停用词）、search（IDF/概念覆盖/同义词）、read（路径与截断）
│   ├── scripts/              # pack.mjs（打包）、watch-apis.mjs（API 文档变更跟踪）、build-ozon-api.mjs
│   └── test/                 # 单元 + 集成 + 黄金集
└── docs/                     # 两个技能库的分析报告、设计文档、交付验证记录
```

## 快速开始

### 1. 准备上游技能库（不随本仓库发布）

```bash
mkdir -p research
git clone --depth 1 https://github.com/xjli360/sealeap-amazon-skills   research/sealeap-amazon-skills
git clone --depth 1 https://github.com/xjli360/sealeap-ecommerce-skills research/sealeap-ecommerce-skills
```

### 2. 打包插件

```bash
node plugin-src/scripts/pack.mjs amazon      # -> $DSH_PLUGINS_DIR/sealeap-amazon-skills
node plugin-src/scripts/pack.mjs ecommerce   # -> $DSH_PLUGINS_DIR/sealeap-ecommerce-skills
```

| 环境变量 | 默认值 | 作用 |
|---|---|---|
| `DSH_PLUGINS_DIR` | `~/dsh-plugins` | 生成插件包的目录 |
| `KJDS_RESEARCH_DIR` | `./research` | 上游技能库克隆目录 |

打包会校验技能数量（602 / 195）、name 唯一、description 非空，然后生成 `lib/catalog.js`（构建期索引，运行期只读常量）、
`lib/config.js`、`index.js`、`cordis.patch.yml` 与插件自带的 README / 许可文件。

### 3. 安装到 DSH

让 Agent 调用 `plugin_manager` 的 `install_bundle`，target 指向生成的包目录；profile 会记录为 `link:`，
两个插件可独立启停、热加载生效。安装后会话技能目录只多两条入口技能，工具 `sealeap_amazon` / `sealeap_ecommerce` 可用。

## 检索工具

| action | 参数 | 行为 |
|---|---|---|
| `search` | `query`、可选 `category`、`limit` | 中英混合检索：字段加权（name 6 / 标题 4 / 中文短描述 5 / 描述 3 / 分类 2）+ IDF + 概念覆盖奖励 + 约 45 组口语同义词；中文整句先切二元组、剥离停用词 |
| `list` | 可选 `category` | 不带参数列分类与计数；带 `category` 下钻到该分类技能清单 |
| `read` | `name` | 返回技能正文（剥离 frontmatter）+ 同级文件清单；未命中时给相近名称 |
| `file` | `name`、`file` | 读技能内 `references/`、`scripts/` 文本；≤2 MB 读取、超 40000 字符截断、拒绝路径穿越与二进制 |

黄金集测试 `plugin-src/test/golden-*.json` 收录 26 条亚马逊 + 14 条跨平台真实运营口语问题，
断言「无零命中」且前三名命中期望技能或概念，防止调权重时把检索改坏。

## ops-core · 运营内核

从实战项目里提炼的可复用层：**配置 → SQLite → HTTP → 规则 → 报表 → 写操作护栏 → 图片工具**。
平台字段全部去掉，Ozon / Amazon / 其它平台都能直接接。

| 模块 | 能力 | 关键约束 |
|---|---|---|
| `config.mjs` | `.secrets/*.env` 解析、必填校验、ID 打码 | 凭据只在内存；`maskId` 用于输出 |
| `db.mjs` | `node:sqlite` + 版本化迁移（`PRAGMA user_version`） | 迁移只增不改；重复调用幂等 |
| `http.mjs` | 429 读 `Retry-After`、5xx 退避、超时、审计回调 | 4xx 不重试；错误统一 `HttpError` |
| `alerts.mjs` | 规则即纯函数，引擎负责去重/排序/截断 | 级别固定 P0/P1/P2 |
| `report.mjs` | Markdown 日报 + 单文件看板 HTML（内联 CSS/SVG） | 不引外部资源，本地双击可看 |
| `actions.mjs` | 提案 → 确认码（15 分钟 TTL）→ 默认 dry-run → 按条目限额 → 审计 | 写操作永远不自动执行；写接口不重试，无法确认记 `unknown` |
| `images.mjs` | Pillow 文字层（俄语/中文）、代理下载、PNG/JPEG 尺寸 | 非拉丁文字必须走 Pillow；`PYTHON_PATH` 可指定解释器 |
| `secrets.mjs` | 凭据泄漏自检：扫工作区 + git 历史 + 禁止入库路径 | 发布/打包前跑一次 |
| `monitor.mjs` | 实时看板：`/api/state` + `/events`（SSE）+ `/healthz` | 只依赖 stateProvider，不绑平台 |

使用的几条铁律：凭据只在 `.secrets/`；写操作必须「提案 + 确认码 + 限额 + 默认 dry-run」；
货币口径分离（落库带 `currency_code`）；数据陈旧要显式报出来（默认 48h）；报表与看板同源。

## 测试

```bash
cd ops-core && node --test     # 内核：13 个用例
cd plugin-src && node --test   # 插件：单元 + 集成（未生成 catalog 的部分用例自动 skip）
```

打包后的插件包内还带 83 / 71 个用例（含黄金集、分类下钻、超长文件截断、入口描述范围）。

## 文档

- [docs/analysis-amazon.md](docs/analysis-amazon.md)、[docs/analysis-ecommerce.md](docs/analysis-ecommerce.md)：两个技能库的规模、结构、检索字段与许可分析
- [docs/superpowers/specs/](docs/superpowers/specs/)：插件设计（为什么不是全量注册、检索质量两轮改进）
- [docs/superpowers/plans/](docs/superpowers/plans/)：实施计划
- [docs/verification.md](docs/verification.md)：交付与验证记录（打包结果、实测检索、API 文档跟踪）
- [docs/lessons-from-ozon.md](docs/lessons-from-ozon.md)：从实战项目带出来的工程经验

## 不随仓库发布

以下目录只存在于本地工作区（见 `.gitignore`）：

| 路径 | 原因 |
|---|---|
| `research/` | 上游技能库浅克隆、第三方 API 规格快照与厂商 npm 包，体积大且可自行获取 |
| `plugin-src/extras/` | OZON 官方 API 端点速查，派生自无明确许可的第三方镜像，不再分发；`plugin-src/scripts/build-ozon-api.mjs` 保留生成逻辑 |
| `docs/inventory/`、`docs/api-watch/` | 机器生成的分析清单与 API 跟踪运行数据 |
| `tmp/`、`.dsh-acl-reports/` | 本地临时脚本与诊断记录 |

## 许可

本仓库原创代码与文档以 **MIT** 发布，见 [LICENSE](LICENSE)。

上游技能库（`sealeap-amazon-skills`、`sealeap-ecommerce-skills`）是 MIT，Copyright (c) 2026 SeaLeap；
它们不随本仓库分发，构建出的插件包会原样保留其 LICENSE / NOTICE / THIRD_PARTY_NOTICES 与各技能自带许可。
平台名称与商标归各权利人，详见 [NOTICE](NOTICE)。
