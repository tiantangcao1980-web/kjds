# OZON API 文件补充（sealeap-ecommerce-skills）设计

日期：2026-11-06　状态：已获用户选定方案 A（纯文档）+ 两个 API 都补

## 意图与原因

现有 26 个 OZON 技能全部以 MPstats/HOLD MCP 数据分析为前提；缺少「官方接口怎么调」这一层，
导致：
- 用户问「OZON API 怎么查商品/改价/发货」时库里无技能；
- 技能里出现「导出/补数」诉求时，模型不知道官方端点、认证头、限流，只能空泛建议。

目标：把 OZON 官方 Seller API（483 个操作）与 Performance API（48 个操作）补成**离线可查的
技能 + 参考文件**，让模型能给出准确的端点、认证、必填字段、限流与错误处理方案。

## 目标 / 非目标

- 目标：新增 1 个技能 `sealeap-ozon-seller-api`；提供认证、通用约定、错误与限流、版本迁移，
  以及按业务域拆分的端点清单（每文件 < 40k 字符，可被 `file` 工具完整读出）。
- 非目标：不做真实 API 调用（无凭据、无沙箱、不引入网络能力）；不改造检索工具；不复制第三方
  仓库的散文说明（只取官方 OpenAPI 的事实：method/path/tag/summary/必填字段/废弃标记）。

## 约束

- `file` 工具单文件上限 2 MB、正文截断 40000 字符 → 端点清单必须按域拆分。
- 插件打包以源仓库内容树为准；本次新增内容放在 `plugin-src/extras/ecommerce/`，由 `pack.mjs`
  合并进包，保持上游克隆干净、可重复构建。
- 数据来源：官方 OpenAPI 快照（`docs.ozon.ru` 的 swagger，抓取于 2026-10-18，经开源镜像
  MissiaL/ozon-api 提供，含 `x-source` 校验字段）。`docs.ozon.ru` 本站有反爬挑战（307 循环），
  无法直接抓取；快照日期写进文档，旧快照与线上差异需以官方文档复核。
- 许可：第三方仓库无 license，只提取事实性端点数据（不搬运其解释性文字），并在包内
  `references/source.md` 标注来源与抓取日期。

## 方案（用户已选 A）

1. `SKILL.md`：何时用（两个 API 的边界）、认证（Seller 双 header；Performance OAuth2
   client_credentials 换 Bearer）、调用范式（几乎全 POST、空 body `{}`、三种 ID、分页不统一、
   RFC3339 时间、snake_case）、限流（默认 50 rps；`/v1/analytics/data` 1 次/分、非 Premium
   50 次/天）、错误（google.rpc code 与 HTTP 状态映射）、安全（无沙箱，写操作改真实店铺；
   只读 key 用于查询）、无凭据时降级要求。
2. `references/`：
   - `auth.md`：两套认证的完整步骤、密钥位置、有效期、权限角色；
   - `conventions.md`：通用约定、限流表、错误码表、分页/版本/时间/幂等注意事项；
   - `index.md`：业务域 → 文件 → 端点数对照表；
   - `endpoints-<domain>.md` × 8：按域分组的端点清单（method + path + 官方摘要 + 必填请求字段 +
     废弃标记）；
   - `performance.md`：广告 API 的认证、异步统计流程、限流、48 个端点；
   - `source.md`：来源、抓取日期、校验信息与使用边界。
3. 构建：`scripts/build-ozon-api.mjs` 读取 `research/ozon-api/*.json` 生成端点清单（可重复）；
   `pack.mjs` 增加 `extrasRoot` 把 extras 合并进 `skills/`，`expectedSkills` 195 → 196。
4. 测试：包内 catalog 计数自动跟随；`test/golden-ecommerce.json` 增加 OZON API 查询断言；
   新增断言「新技能存在且 references 文件可被 file 完整读取（< 40000 字符）」。

## 留给实现者

- 业务域划分与文件命名（按 8 个域）、端点清单的排序（按 path）与中文域标题；
- 摘要保留官方俄文原文，避免翻译引入误差；
- 是否需要 `agents/openai.yaml`（提供中文 short_description 以提升检索命中）。
