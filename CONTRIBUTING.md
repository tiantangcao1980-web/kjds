# 参与贡献

## 环境

- Node.js **22+**（`ops-core` 使用内置 `node:sqlite`，无需编译依赖）
- 打包插件需要先把上游技能库浅克隆到 `research/`（见 README「快速开始」）

## 测试

```bash
cd ops-core && node --test     # 内核单元测试
cd plugin-src && node --test   # 插件单元 + 集成测试（未生成 catalog 时部分用例自动 skip）
```

提交前请在本地跑绿上面的命令，并把关键输出贴进 PR。

## 构建

```bash
node plugin-src/scripts/pack.mjs amazon      # 602 个技能 -> $DSH_PLUGINS_DIR/sealeap-amazon-skills
node plugin-src/scripts/pack.mjs ecommerce   # 195 个技能（本地有 extras 时为 196）
```

环境变量：`DSH_PLUGINS_DIR`（默认 `~/dsh-plugins`）、`KJDS_RESEARCH_DIR`（默认 `./research`）。
打包脚本会校验技能数量、name 唯一、description 非空，然后生成 `lib/catalog.js` 与 `lib/config.js`。

## 约定

- ESM + 零运行时依赖优先；纯函数（分词、打分、路径规范化）与 IO 分离，便于单测。
- 改检索行为（分词、权重、同义词）时，先扩展 `plugin-src/test/golden-*.json` 黄金集，再改实现。
- 报告与文档里的路径一律用仓库相对路径，不要写本机绝对路径。
- 不要提交凭据、`.secrets/`、`research/`、`tmp/`、`docs/inventory/`、`docs/api-watch/` 运行数据；这些已在 `.gitignore` 中排除。

## PR

说明动机（解决什么问题）、改动范围，以及验证命令与输出。行为变化请同时更新对应文档（`docs/`）。
