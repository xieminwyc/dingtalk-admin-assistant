# 员工助手意图路由实现计划

> **给代理式执行者：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务逐步执行本计划。所有步骤使用复选框 `- [ ]` 语法跟踪。

**目标：** 将当前钉钉机器人从“单一路径 FAQ 回复流”升级为“员工助手流”，能够完成意图分类、知识问答与事务请求分流、返回事务入口指引，并为未来外部 RAG 接入保留清晰边界。

**架构：** 保留现有 Stream Mode 入口与 assistant service 作为主运行路径，但把内部流程拆成明确的意图分析、请求路由、本地知识卡片检索、事务目录解析与统一回复组装。第一版先用本地种子内容跑通，同时增加轻量持久化边界和外部 RAG Provider 配置，不在本项目内自建重型 RAG 系统。

**技术栈：** Node.js、TypeScript、Next.js App Router、Vitest、DingTalk Stream SDK、dotenv/zod、Prisma schema scaffolding

---

## 范围

本计划实现已批准 spec 中的第一子项目：

- 粗粒度意图分析
- `knowledge_query`、`task_request`、`handoff_request`、`smalltalk`、`unknown` 五类路由
- 本地知识卡片与事务目录种子数据
- 面向事务入口的更丰富回复格式
- 兼容 SiliconFlow 的模型兜底配置边界
- 轻量数据库 schema 与会话日志边界

本计划不实现：

- 钉钉文档自动同步
- 自建向量检索
- 直接发起 OA 审批
- 完整后台 CMS
- 超出接口边界之外的外部 RAG 运行时集成

## 计划文件结构

| 路径 | 职责 |
| --- | --- |
| `src/config/env.ts` | 解析钉钉与 SiliconFlow 运行时配置 |
| `src/config/env.test.ts` | 校验必填与可选环境变量解析逻辑 |
| `src/modules/intents/intent.types.ts` | 定义意图结果与路由类型 |
| `src/modules/intents/intent-analyzer.ts` | 规则优先、模型兜底的意图分析器 |
| `src/modules/intents/intent-analyzer.test.ts` | 校验意图分类与冲突判定 |
| `src/modules/intents/model-intent-classifier.ts` | SiliconFlow 兼容的模型分类客户端 |
| `src/modules/intents/model-intent-classifier.test.ts` | 校验模型分类客户端请求与返回归一化 |
| `src/modules/knowledge/retriever.types.ts` | 本地卡片与未来外部 RAG 共用的知识检索接口 |
| `src/modules/knowledge/knowledge-card.types.ts` | 本地知识卡片结构 |
| `src/modules/knowledge/sample-knowledge-cards.ts` | 第一版知识卡片种子数据 |
| `src/modules/knowledge/knowledge-card-retriever.ts` | 检索本地知识卡片 |
| `src/modules/knowledge/knowledge-card-retriever.test.ts` | 校验本地知识卡片检索行为 |
| `src/modules/knowledge/external-rag-retriever.ts` | 外部 RAG 接口边界 |
| `src/modules/knowledge/external-rag-retriever.test.ts` | 校验外部 RAG 结果归一化 |
| `src/modules/tasks/task-catalog.types.ts` | 事务目录项结构 |
| `src/modules/tasks/sample-task-catalog.ts` | 第一版事务目录种子数据 |
| `src/modules/tasks/task-catalog.service.ts` | 根据任务意图返回事务入口指引 |
| `src/modules/tasks/task-catalog.service.test.ts` | 校验事务目录匹配与兜底 |
| `src/modules/router/request-router.ts` | 按意图把请求分流到知识、事务、人工或澄清 |
| `src/modules/router/request-router.test.ts` | 校验路由决策与重叠场景 |
| `src/modules/assistant/assistant.types.ts` | assistant 响应联合类型 |
| `src/modules/assistant/reply-builder.ts` | 把不同类型结果拼成最终回复文本 |
| `src/modules/assistant/reply-builder.test.ts` | 校验知识、事务、兜底回复格式 |
| `src/modules/assistant/assistant.service.ts` | 编排 analyze -> route -> resolve -> reply |
| `src/modules/assistant/assistant.service.test.ts` | assistant 编排层端到端测试 |
| `src/modules/logging/conversation-log.types.ts` | 会话日志记录结构 |
| `src/modules/logging/conversation-log.repository.ts` | 保存路由结果的持久化边界 |
| `src/modules/logging/conversation-log.repository.test.ts` | 校验日志边界行为 |
| `src/modules/dingtalk/stream-client.ts` | 在 Stream Mode 下组装新的助手运行时 |
| `src/modules/dingtalk/stream-handler.ts` | 保持消息提取与回复投递稳定 |
| `src/app/api/dingtalk/webhook/route.ts` | 使用同一套运行时的本地 API 入口 |
| `src/app/api/dingtalk/webhook/route.test.ts` | 校验路由返回任务或知识结果 |
| `src/modules/assistant/create-assistant-runtime.ts` | 组装默认本地运行时依赖 |
| `prisma/schema.prisma` | 轻量 schema：部门、知识卡片、事务目录、provider 配置、日志 |
| `docs/knowledge-card-template.md` | 把钉钉文档整理成 Markdown 卡片的模板 |

---

### 任务 1：补齐意图分析与 provider 边界的运行时配置

**文件：**
- 修改：`src/config/env.ts`
- 修改：`src/config/env.test.ts`
- 修改：`README.md`

- [ ] **步骤 1：先写失败的环境变量测试**

增加以下测试：

- 可选的 `SILICONFLOW_API_KEY`
- 可选的 `SILICONFLOW_BASE_URL`
- 可选的 `SILICONFLOW_MODEL`
- 现有钉钉配置仍保持原行为

- [ ] **步骤 2：运行测试，确认先失败**

运行：`npm test -- --run src/config/env.test.ts`
预期：FAIL，因为当前还没有解析 SiliconFlow 相关字段。

- [ ] **步骤 3：写最小实现**

扩展 `AppEnv` 与解析逻辑，加入：

```ts
siliconflowApiKey?: string;
siliconflowBaseUrl?: string;
siliconflowModel?: string;
```

保持这些字段可选，这样在没有模型配置时，本地规则模式也能运行。

- [ ] **步骤 4：重新运行测试，确认通过**

运行：`npm test -- --run src/config/env.test.ts`
预期：PASS

- [ ] **步骤 5：更新环境变量文档**

在 `README.md` 中补充这些可选变量，并说明它们只用于意图模型兜底，不是本地规则模式的必填项。

- [ ] **步骤 6：提交**

```bash
git add src/config/env.ts src/config/env.test.ts README.md
git commit -m "chore: add intent model configuration"
```

---

### 任务 2：定义员工助手的路由类型与回复契约

**文件：**
- 创建：`src/modules/intents/intent.types.ts`
- 创建：`src/modules/assistant/assistant.types.ts`
- 测试：`src/modules/assistant/reply-builder.test.ts`

- [ ] **步骤 1：先写失败的 reply builder 测试**

新增失败测试，描述三种输出：

- 知识型答案
- 事务入口指引
- 澄清/转人工兜底

- [ ] **步骤 2：运行测试，确认先失败**

运行：`npm test -- --run src/modules/assistant/reply-builder.test.ts`
预期：FAIL，因为当前 reply builder 只理解 FAQ 命中和 handoff。

- [ ] **步骤 3：补齐路由与响应类型**

定义：

```ts
export type IntentType =
  | "knowledge_query"
  | "task_request"
  | "handoff_request"
  | "smalltalk"
  | "unknown";
```

以及 assistant 的联合返回类型，例如：

```ts
type AssistantResolution =
  | { kind: "knowledge"; ... }
  | { kind: "task"; ... }
  | { kind: "handoff"; ... }
  | { kind: "clarification"; ... }
  | { kind: "smalltalk"; ... };
```

- [ ] **步骤 4：最小修改 reply builder**

让 `reply-builder.ts` 能输出事务型回复，但不要顺手重构无关格式。

- [ ] **步骤 5：重新运行测试，确认通过**

运行：`npm test -- --run src/modules/assistant/reply-builder.test.ts`
预期：PASS

- [ ] **步骤 6：提交**

```bash
git add src/modules/intents/intent.types.ts src/modules/assistant/assistant.types.ts src/modules/assistant/reply-builder.ts src/modules/assistant/reply-builder.test.ts
git commit -m "feat: add assistant routing response types"
```

---

### 任务 3：实现规则优先、模型兜底的意图分析器

**文件：**
- 创建：`src/modules/intents/intent-analyzer.ts`
- 创建：`src/modules/intents/intent-analyzer.test.ts`
- 创建：`src/modules/intents/model-intent-classifier.ts`
- 创建：`src/modules/intents/model-intent-classifier.test.ts`
- 修改：`src/modules/assistant/assistant.service.ts`

- [ ] **步骤 1：先写失败的意图分析测试**

覆盖：

- `我要请假` -> `task_request`
- `请假流程是什么` -> `task_request`
- `年假规则是什么` -> `knowledge_query`
- `帮我找行政` -> `handoff_request`
- `你好` -> `smalltalk`
- 模糊输入 -> `unknown`
- 模糊表达会回落到模型分类

- [ ] **步骤 2：运行测试，确认先失败**

运行：`npm test -- --run src/modules/intents/intent-analyzer.test.ts`
预期：FAIL，因为当前还没有分析器。

- [ ] **步骤 3：实现最小可用分析器**

补上：

- 动作词规则
- 事务 vs 知识的冲突判定规则
- 真实的模型 fallback 注入点
- 一个兼容 SiliconFlow chat completions 的模型分类客户端

测试里使用 mocked fetch/client，确保 fallback 路径被真正跑到，但不依赖线上密钥。

- [ ] **步骤 4：重新运行测试，确认通过**

运行：`npm test -- --run src/modules/intents/intent-analyzer.test.ts`
预期：PASS

- [ ] **步骤 5：补一个 assistant 编排层 smoke test**

在 `assistant.service.test.ts` 里新增一个失败期望，确保 service 会遵守 analyzer 的输出契约。

- [ ] **步骤 6：提交**

```bash
git add src/modules/intents/intent-analyzer.ts src/modules/intents/intent-analyzer.test.ts src/modules/intents/model-intent-classifier.ts src/modules/intents/model-intent-classifier.test.ts src/modules/assistant/assistant.service.test.ts
git commit -m "feat: add rule-first intent analyzer"
```

---

### 任务 4：引入本地知识卡片作为第一版知识来源

**文件：**
- 创建：`src/modules/knowledge/knowledge-card.types.ts`
- 创建：`src/modules/knowledge/sample-knowledge-cards.ts`
- 创建：`src/modules/knowledge/knowledge-card-retriever.ts`
- 创建：`src/modules/knowledge/knowledge-card-retriever.test.ts`
- 创建：`src/modules/knowledge/external-rag-retriever.ts`
- 创建：`src/modules/knowledge/external-rag-retriever.test.ts`
- 修改：`src/modules/knowledge/retriever.types.ts`

- [ ] **步骤 1：先写失败的知识卡片检索测试**

覆盖：

- 标题/关键词精确命中
- 带部门域过滤的命中
- 无结果兜底
- 外部 provider 边界能把结果归一化成 `KnowledgeHit[]`
- 外部 provider 失败时，能在编排层降级到本地卡片

- [ ] **步骤 2：运行测试，确认先失败**

运行：`npm test -- --run src/modules/knowledge/knowledge-card-retriever.test.ts src/modules/knowledge/external-rag-retriever.test.ts`
预期：FAIL，因为两个 retriever 现在都不存在。

- [ ] **步骤 3：补齐最小知识卡片模型**

先准备几条代表性种子数据：

- HR：年假规则
- 行政：会议室预订
- IT：权限申请说明

同时扩展共享检索类型，让本地卡片与未来外部 provider 都能复用同一套 assistant 契约。

- [ ] **步骤 4：实现本地卡片检索与外部 provider 边界**

本地卡片检索先保持简单可控：

- 标题归一化命中
- 关键词命中
- 可选部门过滤

外部 provider 部分要做到：

- 把外部结果归一化为 `KnowledgeHit[]`
- fetch/client 走注入
- provider 失败时把错误往上传，让 assistant service 做降级

- [ ] **步骤 5：重新运行测试，确认通过**

运行：`npm test -- --run src/modules/knowledge/knowledge-card-retriever.test.ts src/modules/knowledge/external-rag-retriever.test.ts`
预期：PASS

- [ ] **步骤 6：提交**

```bash
git add src/modules/knowledge/knowledge-card.types.ts src/modules/knowledge/sample-knowledge-cards.ts src/modules/knowledge/knowledge-card-retriever.ts src/modules/knowledge/knowledge-card-retriever.test.ts src/modules/knowledge/external-rag-retriever.ts src/modules/knowledge/external-rag-retriever.test.ts src/modules/knowledge/retriever.types.ts
git commit -m "feat: add local knowledge card retrieval"
```

---

### 任务 5：引入事务目录，支持入口型回复

**文件：**
- 创建：`src/modules/tasks/task-catalog.types.ts`
- 创建：`src/modules/tasks/sample-task-catalog.ts`
- 创建：`src/modules/tasks/task-catalog.service.ts`
- 创建：`src/modules/tasks/task-catalog.service.test.ts`

- [ ] **步骤 1：先写失败的事务目录测试**

覆盖：

- 事务关键词命中
- 匹配结果包含入口 URL
- 找不到入口时的兜底

- [ ] **步骤 2：运行测试，确认先失败**

运行：`npm test -- --run src/modules/tasks/task-catalog.service.test.ts`
预期：FAIL，因为事务目录还不存在。

- [ ] **步骤 3：补齐最小事务目录模型**

先做几条代表性种子项：

- 请假申请
- 报销申请
- 会议室预约
- 权限开通

- [ ] **步骤 4：实现事务目录服务**

根据 `taskType` 或关键词解析出：

- 事务标题
- 说明文案
- 准备事项
- 入口 URL
- 兜底联系人

- [ ] **步骤 5：重新运行测试，确认通过**

运行：`npm test -- --run src/modules/tasks/task-catalog.service.test.ts`
预期：PASS

- [ ] **步骤 6：提交**

```bash
git add src/modules/tasks/task-catalog.types.ts src/modules/tasks/sample-task-catalog.ts src/modules/tasks/task-catalog.service.ts src/modules/tasks/task-catalog.service.test.ts
git commit -m "feat: add task catalog routing"
```

---

### 任务 6：实现请求路由器并接入 assistant service

**文件：**
- 创建：`src/modules/router/request-router.ts`
- 创建：`src/modules/router/request-router.test.ts`
- 修改：`src/modules/assistant/assistant.service.ts`
- 修改：`src/modules/assistant/assistant.service.test.ts`
- 修改：`src/modules/handoff/handoff.service.ts`

- [ ] **步骤 1：先写失败的路由器测试**

覆盖：

- `knowledge_query` 走知识解析
- `task_request` 走事务解析
- `handoff_request` 走人工
- `smalltalk` 走轻量回复
- `unknown` 返回澄清
- `knowledge_query` 在外部 provider 报错时会降级到本地卡片

- [ ] **步骤 2：运行测试，确认先失败**

运行：`npm test -- --run src/modules/router/request-router.test.ts src/modules/assistant/assistant.service.test.ts`
预期：FAIL，因为目前没有 router，assistant service 仍是假设单一路径。

- [ ] **步骤 3：实现最小路由器**

路由器需要做到：

- 接收 `IntentResult`
- 只调用一个 resolver
- 返回 `AssistantResolution`

同时更新 assistant service：

- 先分析意图
- 再路由
- 最后拼回复
- 仅当路由结果是 `knowledge_query` 且配置启用外部 provider 时才尝试外部知识检索
- 外部 provider 失败或没有可靠结果时降级到本地知识卡片

并且顺手把 `handoff.service.ts` 里的临时标记文案去掉。

- [ ] **步骤 4：重新运行测试，确认通过**

运行：`npm test -- --run src/modules/router/request-router.test.ts src/modules/assistant/assistant.service.test.ts`
预期：PASS

- [ ] **步骤 5：再次运行 reply builder 测试**

运行：`npm test -- --run src/modules/assistant/reply-builder.test.ts`
预期：PASS，且能覆盖更丰富的响应联合类型。

- [ ] **步骤 6：提交**

```bash
git add src/modules/router/request-router.ts src/modules/router/request-router.test.ts src/modules/assistant/assistant.service.ts src/modules/assistant/assistant.service.test.ts src/modules/handoff/handoff.service.ts src/modules/assistant/reply-builder.ts src/modules/assistant/reply-builder.test.ts
git commit -m "feat: route assistant requests by intent"
```

---

### 任务 7：补上会话日志边界与轻量持久化 schema

**文件：**
- 创建：`src/modules/logging/conversation-log.types.ts`
- 创建：`src/modules/logging/conversation-log.repository.ts`
- 创建：`src/modules/logging/conversation-log.repository.test.ts`
- 创建：`prisma/schema.prisma`

- [ ] **步骤 1：先写失败的会话日志测试**

覆盖：

- 追加一条日志
- 保存路由类型和 confidence
- 可选地保存命中的知识/事务引用

- [ ] **步骤 2：运行测试，确认先失败**

运行：`npm test -- --run src/modules/logging/conversation-log.repository.test.ts`
预期：FAIL，因为当前还没有日志边界。

- [ ] **步骤 3：实现最小内存版 repository 契约**

先做内存实现，保证运行时 wiring 简单；但接口要按未来 Prisma repository 的形状来设计。

- [ ] **步骤 4：补 Prisma schema 脚手架**

定义以下模型：

- `Department`
- `KnowledgeCard`
- `TaskCatalogItem`
- `KnowledgeProviderConfig`
- `ConversationLog`

这一阶段先定义 schema 和字段，不急着把 Prisma 真正接进运行时。

- [ ] **步骤 5：重新运行测试，确认通过**

运行：`npm test -- --run src/modules/logging/conversation-log.repository.test.ts`
预期：PASS

- [ ] **步骤 6：提交**

```bash
git add src/modules/logging/conversation-log.types.ts src/modules/logging/conversation-log.repository.ts src/modules/logging/conversation-log.repository.test.ts prisma/schema.prisma
git commit -m "feat: add logging boundary and persistence schema"
```

---

### 任务 8：组装默认运行时并接入两个入口

**文件：**
- 创建：`src/modules/assistant/create-assistant-runtime.ts`
- 修改：`src/modules/dingtalk/stream-client.ts`
- 修改：`src/modules/dingtalk/stream-client.test.ts`
- 修改：`src/modules/dingtalk/stream-handler.ts`
- 修改：`src/app/api/dingtalk/webhook/route.ts`
- 修改：`src/app/api/dingtalk/webhook/route.test.ts`

- [ ] **步骤 1：先写失败的集成测试**

更新 route 与 stream 相关测试，覆盖：

- 一个事务请求，比如 `我要请假`
- 一个知识请求，比如 `年假规则是什么`

- [ ] **步骤 2：运行测试，确认先失败**

运行：`npm test -- --run src/app/api/dingtalk/webhook/route.test.ts src/modules/dingtalk/stream-client.test.ts`
预期：FAIL，因为当前运行时还是旧的 FAQ-only 组装方式。

- [ ] **步骤 3：创建统一组装 helper**

新增 `create-assistant-runtime.ts`，统一组装：

- intent analyzer
- model intent classifier
- knowledge card retriever
- external rag retriever
- task catalog service
- handoff service
- assistant service
- conversation logger

- [ ] **步骤 4：最小接线两个入口**

让 Stream client 和本地 API route 都使用同一个 composition helper，保证两条入口行为一致。

- [ ] **步骤 5：重新运行集成测试，确认通过**

运行：`npm test -- --run src/app/api/dingtalk/webhook/route.test.ts src/modules/dingtalk/stream-client.test.ts`
预期：PASS

- [ ] **步骤 6：提交**

```bash
git add src/modules/assistant/create-assistant-runtime.ts src/modules/dingtalk/stream-client.ts src/modules/dingtalk/stream-client.test.ts src/modules/dingtalk/stream-handler.ts src/app/api/dingtalk/webhook/route.ts src/app/api/dingtalk/webhook/route.test.ts
git commit -m "feat: wire employee assistant runtime into entrypoints"
```

---

### 任务 9：补充人工整理知识卡片的说明文档并做最终验证

**文件：**
- 创建：`docs/knowledge-card-template.md`
- 修改：`README.md`
- 修改：`docs/dingtalk-stream-setup.md`

- [ ] **步骤 1：先列出文档交付清单**

需要覆盖：

- 如何准备 Markdown 知识卡片
- 如何准备事务目录卡片
- 哪些环境变量是可选的、哪些是必填的

- [ ] **步骤 2：创建人工整理模板**

新增一个 markdown 模板，包含：

- 轻量 metadata 头
- 一条知识卡片示例
- 一条事务卡片示例

- [ ] **步骤 3：更新 README 和接入手册**

说明：

- 知识 vs 事务的路由逻辑
- 可选 SiliconFlow 配置
- 当前“钉钉文档 -> 人工整理 -> 本地卡片”的内容流程

- [ ] **步骤 4：运行全量测试**

运行：`npm test`
预期：PASS

- [ ] **步骤 5：运行类型检查**

运行：`./node_modules/.bin/tsc --noEmit`
预期：PASS；如果仍有无关的历史类型错误，必须在提交前明确记录。

- [ ] **步骤 6：提交**

```bash
git add docs/knowledge-card-template.md README.md docs/dingtalk-stream-setup.md
git commit -m "docs: add employee assistant content guidance"
```

---

## 最终验证清单

- [ ] `src/modules/intents/intent-analyzer.test.ts` 通过
- [ ] `src/modules/router/request-router.test.ts` 通过
- [ ] `src/modules/tasks/task-catalog.service.test.ts` 通过
- [ ] `src/modules/knowledge/knowledge-card-retriever.test.ts` 通过
- [ ] `src/modules/knowledge/external-rag-retriever.test.ts` 通过
- [ ] `src/modules/assistant/assistant.service.test.ts` 通过
- [ ] `src/app/api/dingtalk/webhook/route.test.ts` 通过
- [ ] `src/modules/dingtalk/stream-client.test.ts` 通过
- [ ] `npm test` 通过
- [ ] `./node_modules/.bin/tsc --noEmit` 通过，或者把残留的无关历史错误明确记录

## 给执行者的注意事项

- 每个任务都严格按 `@superpowers:test-driven-development` 走：先写失败测试，确认红，再做最小实现。
- 所有 provider 边界都要保持可注入，不要把 SiliconFlow 网络调用硬编码进主流程。
- 第一版尽量优先使用种子数据和内存 repository，除非任务明确要求接入 Prisma 运行时。
- 保持钉钉入口行为稳定，尽量只改内部实现，不改外部接入方式。
- 回复文案要站在员工角度，语气友好、保守、可执行。
