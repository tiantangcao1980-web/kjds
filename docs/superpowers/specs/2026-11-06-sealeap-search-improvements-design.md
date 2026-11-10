# SeaLeap 插件第二轮完善：检索质量与使用体验

日期：2026-11-06
状态：已定稿（方案 B）

## 意图（why）

第一轮交付把两个技能库打包成可安装插件并跑通「检索 → 读正文 → 读引用」链路。实测发现真实用户的提问方式（整句中文）基本搜不到技能：`新品怎么推`、`广告怎么优化`、`账号被封了怎么办`、`库存积压怎么清` 在两个库都返回 0 条（ecommerce 8 条口语查询 5 条 0 命中，amazon 10 条 4 条 0 命中）。

根因三条：
1. `queryTerms` 只按空白切分，整句中文被当成一个词，永远匹配不上；
2. 602/602、195/195 条技能的中文 `shortDescription`（来自 `agents/openai.yaml`）已在 catalog 里，但检索字段没有索引它；
3. 没有同义词/别名表，中文「封号/秒杀/选品」与英文技能正文之间没有桥。

顺带修三处体验问题：两个入口技能描述几乎相同（模型容易加载错库）、`list` 只有分类计数看不到技能名、`file` 对唯一一个 362 KB 文件直接报错拒读。

## 目标 / 非目标

目标：
- 整句中文（含口语、停用词）能命中正确技能，且排序合理（技能名/中文短描述优先）。
- 中文 ↔ 英文常用运营术语可互相命中。
- 两个入口技能在技能目录里能区分（亚马逊专属 vs 非亚马逊平台）。
- `list` 可按分类下钻到技能名（浏览式发现）。
- 超大文件返回截断内容并说明，而不是硬失败。
- 检索回归测试固化（golden 查询，两库各一份）。

非目标：
- 不做语义向量检索、不引入外部依赖或模型调用。
- 不改变「入口技能 + 工具」的总体架构、不改技能文件内容与目录结构。
- 不为 8.7 MB 重复 `mcp_research.py` 做去重（收益小于风险，另议）。

## 方案（为何是它）

- **方案 A**：只修检索（分词 + 同义词 + 索引 shortDescription + 黄金测试）。最小，但入口技能仍可能互相抢触发、list 仍不能浏览、362 KB 文件仍不可读。
- **方案 B（选定）**：A 的全集，加平台化入口描述、list 下钻、大文件截断。改动集中在插件壳层（`plugin-src/lib/*`、`index.js`、`scripts/pack.mjs`），不碰数据，回归风险可控，一次收尾。
- 被否：向量检索（要外部依赖/模型，离线不可用）；按 query 训练式重排（数据不足，不可解释）。

## 设计要点

### 1. 中文分词（`lib/text.js`）

`queryTerms(query)` 改为：
- 归一化：小写、全角标点转空格、连续空白折叠；
- ASCII 段按空白/标点切词；
- 中文段先剔除停用词（怎么/如何/怎么办/怎么样/什么/哪些/一下/我的/需要/应该/可以/是不是/有没有/吗/呢/了/的/是/我/你），再对剩余中文串生成 **2 字二元组 + 整串**（整串仅当 ≥2 字且 ≤8 字）；
- 去重、去空。

保留原函数签名与返回类型（`string[]`），调用方不变。

### 2. 同义词扩展（`lib/search.js`）

新增 `SYNONYMS`（术语 → 等价词数组，中英双向），命中时按 0.6 权重追加展开词，避免与原始词等权污染排序。覆盖：选品、广告、关键词、Listing、库存/补货/清库存、合规、申诉/封号/冻结、利润/毛利、定价、差评/退货、秒杀/促销、新品/推新、转化率、标题/五点、ACOS/ROAS/CPC/FBA/SKU/VAT/PPC。

### 3. 字段权重与计数（`lib/search.js`）

- 字段：`name 6`、`title 4`、`shortDescription 5`（新增，中文短描述）、`description 3`、`category 2`、`tags 2`。
- `scoreEntry` 内部对每个（词, 字段）的计数封顶 3，防止长描述靠重复刷分。
- 词表由 `queryTerms` 产出后经同义词展开为 `{term, weight}`；导出 `scoreEntry(entry, terms)` 保持兼容（字符串数组仍可用）。

### 4. 入口技能平台化（`index.js` + `scripts/pack.mjs`）

`lib/config.js` 增加 `scopeLine`（由 pack 写入）：amazon 为「亚马逊（Amazon）平台：…」；ecommerce 为「非亚马逊跨境平台：Shopify、Ozon、eBay、Walmart、Wayfair、Etsy、MercadoLibre、TikTok Shop」。`ENTRY_DESCRIPTION` 与 `ENTRY_BODY` 用它开头，并给出「另一个库」的分工提示。

### 5. `list` 下钻（`index.js`）

`action: "list"` + 可选 `category`：给定分类时返回该分类下技能（name + 标题 + 中文短描述，最多 100 条），否则返回分类树。渲染文本明确提示「再传 category 看技能名」。

### 6. 大文件截断（`lib/read.js` + `index.js`）

`file` 超限时改为读取前 40 KB，返回 `{content, truncated: true, size}`，渲染首行注明「已截断，共 N 字节」，避免 UTF-8 半字符（按字节读取后用 `Buffer.toString('utf8')` 并在替换字符处截断）。

### 7. 测试（TDD）

- `test/text.test.js`：整句中文分词、停用词剔除、二元组、混合中英、标点。
- `test/search.test.js`：口语中文命中、shortDescription 权重、同义词（封号→suspension）、计数封顶。
- `test/read.test.js`：截断标记。
- `test/plugin.test.js`：list 下钻、大文件截断渲染。
- `test/golden.test.js` + `test/golden.json`（pack 生成）：每库 10+ 条真实口语/英文查询，断言 top-3 中存在期望技能（正则），先 RED 后 GREEN。

## 交付与验证

1. 源码改动在 `plugin-src/`，`node --test` 全绿（含新测试）。
2. `node scripts/pack.mjs amazon|ecommerce` 重新打包，包内 `node --test` 全绿。
3. 重装/刷新插件后实测：`新品怎么推`、`广告怎么优化`、`账号被封了怎么办`、`库存积压怎么清` 在两库都有结果且首条合理；`list category=shopify` 列技能名；362 KB 文件可截断读取。
4. 更新 `docs/verification.md` 与两包 README。

## 留给实现者的决定

- 停用词与同义词表的初版范围（以实测查询集为准，可增补）。
- golden 查询的期望技能如何选（按业务语义人工指定，不从当前输出反推）。
- 截断上限 40 KB 的具体数值。
