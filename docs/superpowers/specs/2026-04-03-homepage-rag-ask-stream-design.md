# 首页知识问答 AskStream 接入设计

**日期**: 2026-04-03

## 目标

在首页 Web 聊天入口优先接入知识库流式接口 `POST /api/v1/knowledge/ask/stream`，实现知识问答的打字机输出效果，同时保留现有同步 `/ask` 与一次性 `/api/dingtalk/webhook` 作为兜底链路。

## 当前实现状态

截至 2026-04-03，目标已在首页链路落地，实际行为如下：

- 已新增首页专用流式路由 [route.ts](/Users/xiemin/monter/dingtalk-admin-assistant/src/app/api/dingtalk/webhook/stream/route.ts)
- 首页前端 [HomeShell](/Users/xiemin/monter/dingtalk-admin-assistant/src/app/_components/home-shell.tsx) 已改为消费 SSE，并在 `chunk` 阶段逐步更新 assistant 消息
- 对知识问答场景，后端会把上游原始 SSE 统一规整为 `chunk` / `done` / `error` 三类事件，前端不再直接依赖外部服务协议细节
- `done` 事件除了 `reply` 外，还会补齐 `citations`、`images`、`kind`、`meta`
- 图片已支持在首页内联渲染；当消息正文里出现 `{{图1}}` 但真实图片尚未挂载时，前端会先渲染“图片加载中”占位卡片，避免正文先显示占位符、结束时再突然闪现真图
- 钉钉机器人链路未改造为流式发送，仍保持一次性 `replyMarkdown` 回包

## 当前现状

- 首页聊天通过 [webhook 路由](/Users/xiemin/monter/dingtalk-admin-assistant/src/app/api/dingtalk/webhook/route.ts) 以一次性 JSON 方式返回完整回复
- 前端 [HomeShell](/Users/xiemin/monter/dingtalk-admin-assistant/src/app/_components/home-shell.tsx) 只能在请求结束后一次性替换整条 assistant 消息
- 外部知识库同步 `/ask` 已经完成接入，能够返回 `answer`、`source`、`pics`
- `KnowledgeApiClient` 已补齐 `askStream()` 封装，但还没有接入业务链路

以上是本设计编写时的实施前现状；当前仓库代码已不再处于这一阶段。

## 方案选择

本次只做首页 Web 聊天流式化，不改钉钉 stream-handler 一次性回复行为。

推荐方案：

- 新增单独的流式 Web 路由，例如 `/api/dingtalk/webhook/stream`
- 首页前端改为 `fetch()` 消费 SSE 文本流
- 仅在“知识问答 + 存在外部知识库配置”时使用外部 `askStream`
- 其他模式或流式失败场景，退回现有一次性 webhook 逻辑

不选择的方案：

- 不直接让前端访问知识库服务，避免把鉴权、会话映射和路由判断泄漏到浏览器侧
- 不在本次改钉钉消息推送链路，避免把一次性 `replyMarkdown` 扩成更复杂的多段发送协议

## 设计方案

### 1. 新增首页专用流式接口

新增 API 路由负责：

- 读取用户消息、sessionId、entryMode、userId
- 先使用现有 analyzer 判断意图
- 如果是 `internal_knowledge` 且存在外部知识库配置：
  - 调用外部 `askStream`
  - 将外部 `chunk` / `done` / `error` 事件转发给前端
- 否则：
  - 调用现有 `assistant.replyWithDebug()`
  - 将结果包装成单次 `chunk + done` 的伪流式事件

### 2. 保持会话映射与同步兜底

沿用当前钉钉会话 ID 到知识库 `sessionId` 的内存映射。

- 首次流式问答不传 sessionId
- 收到 `done.sessionId` 后更新映射
- 如果外部流式请求失败：
  - 优先退到同步 `assistant.replyWithDebug()`
  - 保证首页至少还能正常返回完整答案

当前落地时还补充了一个图片兜底策略：

- 先尝试直接消费上游 `done.sources` 中的 `imageData`
- 若只有 `imageUrl`，则在服务端补抓并转成 base64
- 如果流式 `done` 阶段仍拿不到可用图片，再额外调用一次同步 `/ask`，使用 `pics` 补齐首页渲染所需的 `images`

### 3. 前端流式消费与消息更新

首页前端改为：

- 发送消息后创建一条 thinking assistant 消息
- 使用 `ReadableStream + TextDecoder` 逐段读取响应
- 每收到一个 `chunk` 事件，就把内容追加到当前 assistant 消息
- 收到 `done` 时补齐：
  - `citations`
  - `images`
  - `kind`
  - `meta`
- 若流式失败则展示错误，或回退到一次性请求结果

当前实现还增加了两个首页展示细节：

- 正文中的 `{{图N}}` 会被替换成内联图片卡片，而不是保留原始占位符文本
- 如果某张图已经在正文中内联显示，就不会再在底部“引用图片”区域重复渲染

### 4. 事件格式

新流式 Web 路由向前端输出统一事件：

- `chunk`: `{ type: "chunk", content: string }`
- `done`: `{ type: "done", reply: string, citations?: [], images?: [], kind?: string, meta?: {} }`
- `error`: `{ type: "error", message: string }`

这样前端不需要直接理解知识库原始 SSE 协议差异。

## 边界与兼容

- `ask` 同步接口保留，继续作为当前知识问答兜底
- 首页以外入口保持不变
- 非知识问答不强行改造成真实流式，只包装成兼容事件，避免扩大改动面
- `pics.data` 继续完整透传到前端，仅在首页展示

## 影响范围

- `src/modules/assistant/create-assistant-runtime.ts`
- `src/modules/knowledge/knowledge-api-client.ts`
- `src/app/api/dingtalk/webhook/stream/route.ts`（新增）
- `src/app/_components/home-shell.tsx`
- `src/app/_components/chat-canvas.tsx`
- `src/app/_components/home-shell.types.ts`
- `src/app/globals.css`
- 相关测试文件

## 测试策略

至少覆盖：

1. 首页流式接口在知识问答时调用 `askStream`
2. 外部 `chunk` 事件被正确透传
3. `done` 事件能把 `citations/images` 一次性补齐
4. 非知识问答仍能正常返回
5. 流式失败时能回退到同步回复

## 实际落地与原设计的差异

- 原设计只要求在 `done` 时补齐图片；实际实现为了适配上游不稳定的图片返回，增加了 `imageUrl` 抓取和同步 `/ask.pics` 兜底
- 原设计没有细化正文中的 `{{图N}}` 渲染；实际实现已经把它升级为内联图片卡片，并补了加载中占位态
- 原设计明确不改钉钉 stream-handler；当前仍然保持这一边界，没有把钉钉机器人改成多段发送协议
