# 从 OZON 项目带过来的经验（可直接复用到 KJDS）

来源：一个 Ozon 跨境运营实战项目（2026-11）。以下都是踩过坑、有实机证据的结论，按「能直接抄」的程度排序。

## 一、架构与代码

1. **单一 CLI 内核**：`bin/xxx.mjs` 只做参数解析，业务在 `src/{config,api,db,pull,rules,render,commands}`；DSH 插件工具只转成子进程调用。好处：模型工具面保持薄，所有写操作天然走 CLI 的护栏。
2. **迁移只增不改**：`PRAGMA user_version` + 数组顺序应用，重复调用幂等；改字段就加新迁移（OZON 从 v1 加到 v6）。
3. **规则与渲染分离**：规则是纯函数 `(ctx) => Alert[]`，报表只拿规则输出。这样加平台只写规则，不动渲染。
4. **日报/看板同源**：同一份指标渲染 Markdown + 单文件 HTML（内联 CSS/SVG），不引外部资源，双击可看。
5. **TDD 有回报**：OZON 最终 123–124 个测试全绿，每次改规则先写用例，后面重构没有翻车。
6. **`ops-core` 现在就是这套东西的抽取版**：`ops-core/`。

## 二、外部 API / 网络

1. **429 必须读 `Retry-After`**，没有才指数退避（1500/3000/4500ms）；4xx 不要重试。
2. **限流按文档写死**：Ozon `/v1/analytics/data` 1 次/分钟、时间窗含端点最多 31 天，必须切片。
3. **货币不同源**：GMV 接口回 RUB、商品价格回 CNY，混用会算错利润——落库带 `currency_code`，对账前校验。
4. **对账不是比大小**：GMV 与结算口径不同，输出 `FACT_RUB` / `RUB_GMV_VS_SETTLED` / `CURRENCY_MISMATCH` 三种结论比一个差值有用。
5. **CDN 会撒谎**：Ozon 图片 `.jpg` 实际是 webp（magic `RIFF....WEBP`），jimp 读不了，用 Pillow 转 PNG。
6. **模型下载源要试**：huggingface 直连不通、hf-mirror 143KB/s、**ModelScope 7.3MB/s**；下模型先做 5MB 测速再决定。
7. **gated 仓库会挡路**：`from_single_file` 会去拉 `stabilityai/stable-diffusion-2-1` config，被 401 挡住；单文件模型走 ComfyUI 更省事。
8. **网络受限时先配代理**：部分海外站点与 GitHub 直连会 `Connection reset`，用 `git -c http.proxy=...` 或环境变量代理即可；代理地址从本机环境读，不要写进代码或文档。
9. **MCP 浏览器禁止 `file://`**：本地 HTML 看板没法在 MCP 浏览器里截图，只能本地打开；别浪费时间。

## 三、环境/工具链坑

1. **uv 在某些 Windows 环境建 venv 会失败**：`Failed to update Windows PE resources ... 拒绝访问`；退回 `python -m venv` 即可。
2. **Windows PowerShell 5.1 的引号**：`$s.Replace(...)` 里带 `\n` / `${}` / 双引号会静默写坏文件；改文件优先用 `edit`/`write` 工具，别用字符串替换生成 JS 模板串。
3. **pip 装大包要分开 index**：`--index-url` 对整条命令生效，torch 用 pytorch index、diffusers 用 PyPI，混在一起会 `No matching distribution found`。
4. **后台任务输出要落文件**：`Select-Object -Last N` 会缓冲到进程结束，看不到进度；重定向到 `.log` 再 `Get-Content -Tail`。

## 四、运营/合规

1. **写操作四道锁**：白名单 + 确认码（6 位）+ 每日限额 + 默认 dry-run；`approve` 不进模型工具面。
2. **只学结构不抄图**：竞品视觉拆解只取配色/区块顺序/布局，成图必须自家实拍或 AI 生成。
3. **社媒抓取边界**：VK 搜索页无登录态返回 0 字节；Telegram/YouTube 公开页可用；不抓买家账号、不绕验证码。
4. **评论星级不可信**：Ozon 评论节点 `statusid` 是状态不是星级；痛点分析用关键词命中更稳。
5. **AI 生图成本要算**：Lovart `gpt-image-2` 1536×2048 单张 **12 credits**；批量前先用便宜模型比价，或本地 ComfyUI 免费跑。
6. **汇率单独存表**（CBR + 兜底 API），报表里显式标日期，别用「今天汇率」糊弄历史数据。

## 五、可复制的清单

- [ ] 新平台接入：`ops-core` + 该平台迁移（商品/订单/分析/价格/库存）+ 规则文件 + CLI 子命令
- [ ] 日报 08:00、取数 07:30、周报周一 09:50 的定时任务
- [ ] DSH 插件：一个技能（操作手册）+ 一个工具（白名单 action → CLI）
- [ ] 写操作提案页：propose/list/approve（确认码）
- [ ] 图片链路：AI 生图（Lovart/ComfyUI）→ Pillow 文字层 → 品牌色带合成 → QA（3:4、≥900px）

## 六、2026-11-09 新增经验（第二批）

### 实时看板

- **不要再做纯轮询**：SSE（`/events`，5 秒/帧）比 15 秒轮询延迟更低、请求更少；前端用 `EventSource` + `readyState === 2` 兜底轮询，两种情况都能用。
- 看板做成**单文件暗色 UI + 内联 SVG**，零外部资源，本地双击或 HTTP 都行；服务端只提供 `stateProvider()`，不绑平台字段。
- 面板顺序按注意力排：预警流 → KPI/走势 → 竞品异动 → 数据新鲜度 → 端点健康；底部 ticker 放 PENDING / 广告消耗 / 汇率。
- 空数据要显式（「近 14 天无销量数据」），否则用户以为页面坏了。

### 广告 → 上架闭环

- 搜索词判定不要止步于「这词好不好」，要产出**可粘贴的三块**：标题补充、后台关键词、不要用；再接 `listing build` 写进后台清单。
- 规则顺序即优先级：`#1 不匹配 → #2 无说服力 → #4 赚钱 → #10 漏词 → #8 长尾 → #5 边缘`；primary 取第一个命中。
- 预算分配用 `W = 销售额/(1+ACOS)` + 下限/上限夹取，剩余留储备，别硬塞。

### 数据口径

- `analytics_daily.sku` 默认全空（dimension=day）；要 SKU 级分析必须显式 `dimension: ['sku','day']`，并按 `[sku, day]` 顺序解析。
- 补货速度从**订单明细** `postings.items_json` 汇总比依赖 analytics 更稳（后者可能没按 SKU 落库）。
- 毛利表必须「缺成本 → HOLD」，演示用的假成本用完立刻删，别污染真实库。

### 安全与工程

- 清理 git 历史里的敏感文件：`filter-branch --index-filter 'git rm -r --cached --ignore-unmatch data'` → 删 `refs/original` → `reflog expire` → `gc`；验证用 `git rev-list --all --objects | grep data/`。
- 用 `stash` 暂存工作区再 filter-branch 有风险：stash 会被重写、清理后**永久丢失**；先提交或复制到临时目录再动手。
- 写操作限额要按**条目数**（一次 import 可带几百条），不是请求次数；写接口**不重试**，超时记 `unknown` 而不是 `failed`。
- 确认码用 `crypto.randomInt` + TTL；插件工具面不要回传确认码（否则模型可自行批准），只返回「在终端执行」。
- 模型下载先测速：hf-mirror 143KB/s vs ModelScope 7.3MB/s（同一文件），大模型一律先比源。
- 本地 sd-turbo 对俄语提示词几乎不响应（生成无关图），本地生图用英文 prompt；Lovart 无此限制，单图 12 credits。
- Windows + PowerShell 5.1：改文件优先用编辑工具，不要用 `-replace` 拼含反引号/`\u`/模板串的内容；后台任务输出重定向到文件再看 tail。
