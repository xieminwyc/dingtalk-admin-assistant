# 外部知识库 Ask 接口对接设计

**日期**: 2026-04-03

## 目标

将当前“知识问答”路径使用的外部知识库接入，统一切换到最新文档定义的同步接口 `POST /api/v1/knowledge/ask`，并保持现有多轮会话映射与本地知识库回退能力。

## 当前实现状态

截至 2026-04-03，外部同步 `ask` 已经成为知识问答主链路的一部分，实际行为如下：

- [KnowledgeApiClient](/Users/xiemin/monter/dingtalk-admin-assistant/src/modules/knowledge/knowledge-api-client.ts) 已完成 `RagAskRequest` / `RagAskResponse` 新协议适配，并同时暴露 `ask()` 与 `askStream()`
- [createExternalRagProvider()](/Users/xiemin/monter/dingtalk-admin-assistant/src/modules/assistant/create-assistant-runtime.ts) 现在使用同步 `/ask` 作为主问答入口，而不是再自行拼装旧 `sources`
- 同步 `/ask` 返回的 `pics` 已经透传进知识命中结果，不再只是“兼容接收不展示”
- 首页流式链路虽然走 `/ask/stream`，但当上游流式事件拿不到图片时，会回退调用同步 `/ask`，使用 `pics` 补齐首页渲染

## 当前现状

- 路由识别为知识问答后，会优先调用外部 `ExternalRagProvider`
- 当前 provider 通过 `KnowledgeApiClient.ask()` 请求外部知识库
- 代码仍按旧返回结构消费 `sources`
- 命中外部知识库后，下游真正使用的字段只有：
  - `answer`
  - `url`
  - `referenceLabel`
- 图片字段当前没有渲染链路

以上是本设计编写时的实施前现状；当前仓库代码已经超出这个阶段。

## 新接口约束

根据最新文档，同步问答接口的请求与响应约束如下：

- 请求字段使用 `question`、`operatorId`、`sessionId`、`maxSources`、`excludeImageData`
- 响应字段使用 `sessionId`、`answer`、`source`、`pics`
- `source` 为按文档去重后的 URL 字符串数组，不再是 chunk 级 `sources`
- `pics` 可能存在，但本次只做兼容接收，不向现有回复链路透出

## 设计方案

### 1. API Client 适配新协议

更新 `KnowledgeApiClient` 中的 `RagAskRequest` 和 `RagAskResponse` 类型：

- `maxChunks` 改为 `maxSources`
- 增加 `excludeImageData?: boolean`
- `sources?: RagAskCitation[]` 改为 `source?: string[]`
- 增加 `pics?: { name: string; data?: string; preview?: string }[]`

### 2. 外部 Provider 消费同步 Ask 接口

`createExternalRagProvider()` 继续调用同步 `apiClient.ask()`，但改为按新协议组装：

- 请求时固定传 `maxSources: 5`
- 请求时固定传 `excludeImageData: false`
- 继续把当前应用会话 `sessionId` 映射到外部知识库 `sessionId`
- 响应里只要 `answer` 存在，就构造单条 `ExternalRagDocument`
- `url` 取 `response.source?.[0]`
- `citations` 根据 `response.source` 生成，并通过 URL 推导可读的 `documentTitle`
- `title` 默认取第一条 citation 的 `documentTitle`，没有时使用“知识库回答”
- `images` 透传 `response.pics`

### 3. 回退与兼容策略

- 超时返回空数组，维持现有“降级本地知识库”的行为
- 其他请求错误继续抛出，由上层统一决定是否回退
- `/ask/stream` 现已接入首页 Web 流式链路，但不影响钉钉机器人与同步知识命中主链路

## 影响范围

- `src/modules/knowledge/knowledge-api-client.ts`
- `src/modules/assistant/create-assistant-runtime.ts`
- `src/app/api/dingtalk/webhook/stream/route.ts`
- `src/modules/knowledge/external-rag-retriever.test.ts`
- 可能补充 `KnowledgeApiClient` 相关测试（如果仓库已有对应模式则沿用）

## 测试策略

按 TDD 执行，至少覆盖：

1. 外部 provider 请求 `/ask` 时使用 `maxSources` 与 `excludeImageData`
2. 外部 provider 能把 `answer + source` 转成统一的知识命中
3. 多轮会话时会复用并更新外部 `sessionId`
4. 超时场景仍降级到本地知识库
5. 旧的 `sources` 假设被清理后，现有测试仍能通过

## 实际落地与原设计的差异

- 设计稿里原本计划对同步 `/ask` 固定传 `excludeImageData: true`，但实际实现为了让首页和钉钉都能消费图片，使用的是 `excludeImageData: false`
- 设计稿里把图片视为“兼容接收”；当前代码里图片已经是正式输出字段，既能进入同步知识命中，也能成为首页流式图片兜底来源
- 设计稿只把 `/ask/stream` 视为后续扩展；当前仓库中它已经用于首页 Web 聊天，但钉钉机器人仍保持一次性回复模式
