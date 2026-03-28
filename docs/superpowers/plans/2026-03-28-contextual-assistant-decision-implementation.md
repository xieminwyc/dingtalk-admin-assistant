# 上下文驱动员工助手重构实施计划

> **给代理式执行者：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务逐步执行本计划。所有步骤使用复选框 `- [ ]` 语法跟踪。

**目标：** 将当前规则优先的路由式助手，重构为一个具备上下文理解、模型主导决策、按需调用知识/事务工具、并能基于工具事实生成自然回复的员工助手。

**架构：** 保留钉钉 Stream / Webhook 入口和 `assistant.service` 作为主运行时边界，但把现有“意图枚举 -> switch 路由 -> 本地模板回复”的链路，替换为“会话上下文层 + 模型驱动的决策引擎 + 统一知识/事务 provider 契约 + 基于工具事实的回复生成层”。整个重构按可渐进交付的方式落地，保证每个任务完成后都可单独测试。

**技术栈：** Node.js、TypeScript、Next.js App Router、Vitest、DingTalk Stream SDK、Zod、dotenv、基于 fetch 的 LLM 集成

---

## 范围

本计划实现已批准的 spec：
[`docs/superpowers/specs/2026-03-28-contextual-assistant-decision-design.md`](/Users/xiemin/monter/dingtalk-admin-assistant/docs/superpowers/specs/2026-03-28-contextual-assistant-decision-design.md)

本次实施包含：

- 将 `knowledge_query / task_request / handoff_request / smalltalk / unknown` 替换为 `knowledge / task / chat / clarify`
- 让 LLM 成为主决策器
- 增加按会话组织的上下文与话题切换处理
- 将本地样例知识、未来上传文档边界、外部 RAG 统一到同一个知识 provider 契约
- 为事务结果增加 `actionType`、`availability` 和更丰富的后续引导信息
- 将当前僵硬的模板回复，替换为“基于工具事实的模型生成回复”

本计划暂不实现：

- 真实的钉钉 OA 发起 API
- 文档上传 UI 或完整的文档入库流程
- 向量数据库 / 重排器基础设施
- 长期记忆或跨会话个性化

## 计划文件结构

| 路径 | 职责 |
| --- | --- |
| `src/modules/intents/intent.types.ts` | 新的顶层助手模式与 `AssistantDecision` 契约 |
| `src/modules/intents/intent-analyzer.ts` | 带会话上下文的决策引擎适配层 |
| `src/modules/intents/intent-analyzer.test.ts` | 决策行为、置信度、话题切换测试 |
| `src/modules/intents/model-intent-classifier.ts` | 决策 JSON 的 LLM 客户端 |
| `src/modules/intents/model-intent-classifier.test.ts` | 决策模型请求/响应归一化测试 |
| `src/modules/logging/conversation-log.types.ts` | 会话消息日志契约 |
| `src/modules/logging/conversation-log.repository.ts` | 存储/读取单会话最近几轮消息 |
| `src/modules/logging/conversation-log.repository.test.ts` | 日志持久化与上下文读取测试 |
| `src/modules/logging/conversation-context.service.ts` | 从日志中构建有边界的最近上下文 |
| `src/modules/logging/conversation-context.service.test.ts` | 上下文窗口、TTL、话题重置测试 |
| `src/modules/knowledge/retriever.types.ts` | 统一知识 provider 输入/输出契约 |
| `src/modules/knowledge/knowledge-card-retriever.ts` | 带 `referenceLabel` 与 `relatedKeywords` 的样例知识 provider |
| `src/modules/knowledge/knowledge-card-retriever.test.ts` | 样例知识 provider 行为测试 |
| `src/modules/knowledge/external-rag-retriever.ts` | 外部 RAG provider 适配器 |
| `src/modules/knowledge/external-rag-retriever.test.ts` | RAG 归一化测试 |
| `src/modules/tasks/task-catalog.types.ts` | 增强后的事务 provider 契约 |
| `src/modules/tasks/task-catalog.service.ts` | 带 availability/action 元数据的事务 provider |
| `src/modules/tasks/task-catalog.service.test.ts` | 事务 provider 解析测试 |
| `src/modules/router/request-router.ts` | 根据 `AssistantDecision` 协调工具执行 |
| `src/modules/router/request-router.test.ts` | 决策到工具执行的编排测试 |
| `src/modules/assistant/assistant.types.ts` | 助手执行结果与回复输入结构 |
| `src/modules/assistant/reply-builder.ts` | 仅在生成失败时使用的紧急文本兜底 |
| `src/modules/assistant/reply-builder.test.ts` | 兜底文本格式测试 |
| `src/modules/assistant/response-generator.ts` | 基于工具事实生成自然语言回复 |
| `src/modules/assistant/response-generator.test.ts` | 回复 prompt 与兜底测试 |
| `src/modules/assistant/assistant.service.ts` | 主编排：加载上下文 -> 决策 -> 调工具 -> 生成回复 |
| `src/modules/assistant/assistant.service.test.ts` | 助手端到端编排测试 |
| `src/modules/assistant/create-assistant-runtime.ts` | 组装决策引擎、providers、上下文服务、回复生成器 |
| `src/modules/dingtalk/stream-handler.ts` | 提取 session 身份并传入更丰富的 assistant 输入 |
| `src/modules/dingtalk/stream-handler.test.ts` | Stream 会话/上下文透传测试 |
| `src/modules/dingtalk/stream-client.ts` | 让 Stream 入口适配新运行时 |
| `src/modules/dingtalk/stream-client.test.ts` | Stream 集成测试 |
| `src/app/api/dingtalk/webhook/route.ts` | 对齐 richer assistant 输入的 HTTP 调试入口 |
| `src/app/api/dingtalk/webhook/route.test.ts` | Webhook 集成测试 |
| `docs/dingtalk-stream-setup.md` | 新模型主导链路的运行与调试文档 |

---

### 任务 1：锁定新的决策与 provider 契约

**文件：**
- 修改：`src/modules/intents/intent.types.ts`
- 修改：`src/modules/assistant/assistant.types.ts`
- 修改：`src/modules/knowledge/retriever.types.ts`
- 修改：`src/modules/tasks/task-catalog.types.ts`
- 测试：`src/modules/assistant/reply-builder.test.ts`
- 测试：`src/modules/tasks/task-catalog.service.test.ts`
- 测试：`src/modules/knowledge/external-rag-retriever.test.ts`

- [ ] **步骤 1：先写失败的契约测试**

为新结构补断言，例如：

```ts
expectTypeOf<AssistantMode>().toEqualTypeOf<
  "knowledge" | "task" | "chat" | "clarify"
>();
expect(result.availability).toBe("available");
expect(hits[0]?.referenceLabel).toBe("年假制度");
```

- [ ] **步骤 2：运行定向测试，确认先失败**

运行：`npm test -- --run src/modules/assistant/reply-builder.test.ts src/modules/tasks/task-catalog.service.test.ts src/modules/knowledge/external-rag-retriever.test.ts`

预期：FAIL，因为当前契约还在使用旧意图枚举和旧 provider 结构。

- [ ] **步骤 3：写最小契约改动**

更新类型，至少引入：

```ts
export type AssistantMode = "knowledge" | "task" | "chat" | "clarify";

export type AssistantDecision = {
  mode: AssistantMode;
  intentConfidence: number;
  needKnowledge: boolean;
  needTaskResolution: boolean;
  topicShift: boolean;
  contextBreakConfidence?: number;
  clarifyQuestion?: string;
  knowledgeHint?: string;
  taskHint?: string;
};
```

同时扩展 provider 返回结构：

```ts
referenceLabel?: string;
relatedKeywords?: string[];
actionType?: "url" | "api";
availability?: "available" | "unavailable" | "unknown";
availabilityReason?: string;
```

- [ ] **步骤 4：重新运行定向测试，确认通过**

运行：`npm test -- --run src/modules/assistant/reply-builder.test.ts src/modules/tasks/task-catalog.service.test.ts src/modules/knowledge/external-rag-retriever.test.ts`

预期：PASS

- [ ] **步骤 5：提交契约变更**

```bash
git add src/modules/intents/intent.types.ts src/modules/assistant/assistant.types.ts src/modules/knowledge/retriever.types.ts src/modules/tasks/task-catalog.types.ts src/modules/assistant/reply-builder.test.ts src/modules/tasks/task-catalog.service.test.ts src/modules/knowledge/external-rag-retriever.test.ts
git commit -m "refactor: define contextual assistant contracts"
```

---

### 任务 2：增加按会话组织的上下文读取层

**文件：**
- 修改：`src/modules/logging/conversation-log.types.ts`
- 修改：`src/modules/logging/conversation-log.repository.ts`
- 修改：`src/modules/logging/conversation-log.repository.test.ts`
- 创建：`src/modules/logging/conversation-context.service.ts`
- 创建：`src/modules/logging/conversation-context.service.test.ts`

- [ ] **步骤 1：先写失败的上下文窗口测试**

覆盖这些场景：

- 追加带 `sessionId` 的用户/助手消息
- 只读取最近 N 轮消息
- TTL 超时后过期消息不会再进入上下文
- 不会读取其他 session 的消息

示例：

```ts
expect(await service.loadRecentContext("session-a")).toEqual([
  { role: "user", content: "你能做什么？" },
  { role: "assistant", content: "我可以帮你查制度..." }
]);
```

- [ ] **步骤 2：运行测试，确认先失败**

运行：`npm test -- --run src/modules/logging/conversation-log.repository.test.ts src/modules/logging/conversation-context.service.test.ts`

预期：FAIL，因为当前 repository 还不能存储 speaker/response 数据，也不能返回有边界的上下文。

- [ ] **步骤 3：扩展日志结构并新增上下文服务**

为日志契约补充最小字段：

```ts
sessionId: string;
role: "user" | "assistant";
content: string;
decisionMode?: AssistantMode;
referenceLabel?: string | null;
```

然后新增 `conversation-context.service.ts`，提供：

```ts
loadRecentContext(sessionId: string, options?: { maxTurns?: number; ttlMs?: number })
```

如果可以，尽量让这个服务只是在 repository 读取结果上做轻量处理。

- [ ] **步骤 4：重新运行测试，确认通过**

运行：`npm test -- --run src/modules/logging/conversation-log.repository.test.ts src/modules/logging/conversation-context.service.test.ts`

预期：PASS

- [ ] **步骤 5：提交上下文层**

```bash
git add src/modules/logging/conversation-log.types.ts src/modules/logging/conversation-log.repository.ts src/modules/logging/conversation-log.repository.test.ts src/modules/logging/conversation-context.service.ts src/modules/logging/conversation-context.service.test.ts
git commit -m "feat: add session conversation context service"
```

---

### 任务 3：用模型主导的决策引擎替换旧意图分类器

**文件：**
- 修改：`src/modules/intents/intent-analyzer.ts`
- 修改：`src/modules/intents/intent-analyzer.test.ts`
- 修改：`src/modules/intents/model-intent-classifier.ts`
- 修改：`src/modules/intents/model-intent-classifier.test.ts`
- 修改：`src/modules/assistant/create-assistant-runtime.ts`

- [ ] **步骤 1：先写失败的决策引擎测试**

覆盖：

- `你是谁` -> `chat`
- 带上文闲聊上下文时，`那请假怎么申请` -> `task`
- 在任务流程后突然问 `那明天下雨吗？` -> `chat` 且 `topicShift=true`
- 低置信度模糊输入 -> `clarify`

示例：

```ts
expect(result).toEqual({
  mode: "chat",
  intentConfidence: 0.42,
  needKnowledge: false,
  needTaskResolution: false,
  topicShift: true,
  contextBreakConfidence: 0.91
});
```

- [ ] **步骤 2：运行测试，确认先失败**

运行：`npm test -- --run src/modules/intents/intent-analyzer.test.ts src/modules/intents/model-intent-classifier.test.ts`

预期：FAIL，因为当前实现仍然返回旧的五类意图枚举。

- [ ] **步骤 3：重写决策契约与 prompt**

调整模型客户端，让它请求这种决策 JSON：

```json
{
  "mode": "task",
  "intentConfidence": 0.93,
  "needKnowledge": false,
  "needTaskResolution": true,
  "topicShift": false,
  "taskHint": "leave_application"
}
```

同时在 prompt 里明确说明：

- 要结合上下文做模式判断
- 要识别话题切换
- 低置信时进入 `clarify`
- 不再允许旧的 `handoff_request` / `unknown` 标签

- [ ] **步骤 4：只保留最小兜底**

如果模型请求失败，或返回不可解析 JSON，统一回：

```ts
{
  mode: "clarify",
  intentConfidence: 0,
  needKnowledge: false,
  needTaskResolution: false,
  topicShift: false,
  clarifyQuestion: "我先确认一下，你是想查制度说明，还是想办理流程？"
}
```

不要重新引入关键词优先路由。

- [ ] **步骤 5：重新运行测试，确认通过**

运行：`npm test -- --run src/modules/intents/intent-analyzer.test.ts src/modules/intents/model-intent-classifier.test.ts`

预期：PASS

- [ ] **步骤 6：提交决策引擎重构**

```bash
git add src/modules/intents/intent-analyzer.ts src/modules/intents/intent-analyzer.test.ts src/modules/intents/model-intent-classifier.ts src/modules/intents/model-intent-classifier.test.ts src/modules/assistant/create-assistant-runtime.ts
git commit -m "refactor: add model-led assistant decision engine"
```

---

### 任务 4：统一样例知识与外部 RAG 的 provider 结构

**文件：**
- 修改：`src/modules/knowledge/knowledge-card-retriever.ts`
- 修改：`src/modules/knowledge/knowledge-card-retriever.test.ts`
- 修改：`src/modules/knowledge/external-rag-retriever.ts`
- 修改：`src/modules/knowledge/external-rag-retriever.test.ts`
- 修改：`src/modules/knowledge/sample-knowledge-cards.ts`
- 修改：`src/modules/assistant/create-assistant-runtime.ts`

- [ ] **步骤 1：先写失败的 provider 测试**

覆盖：

- 样例知识命中时返回 `referenceLabel`
- 无命中时返回 `relatedKeywords`
- 外部 RAG 结果归一为同一结构

示例：

```ts
expect(hits[0]).toMatchObject({
  source: "seed",
  referenceLabel: "年假规则"
});
expect(result.relatedKeywords).toEqual(["年假折现", "离职补偿"]);
```

- [ ] **步骤 2：运行测试，确认先失败**

运行：`npm test -- --run src/modules/knowledge/knowledge-card-retriever.test.ts src/modules/knowledge/external-rag-retriever.test.ts`

预期：FAIL，因为 provider 还没有暴露这些更丰富的元数据。

- [ ] **步骤 3：写最小 provider 改动**

更新样例知识 provider：

- 将样例卡映射成 `source: "seed"`
- 返回 `referenceLabel`
- 无命中时，基于 title / keywords 计算简单的 `relatedKeywords`

更新外部 RAG 适配器，使其归一化结果至少包含：

```ts
source: "rag";
referenceLabel: document.title;
relatedKeywords?: [];
```

- [ ] **步骤 4：重新运行测试，确认通过**

运行：`npm test -- --run src/modules/knowledge/knowledge-card-retriever.test.ts src/modules/knowledge/external-rag-retriever.test.ts`

预期：PASS

- [ ] **步骤 5：提交知识 provider 统一改动**

```bash
git add src/modules/knowledge/knowledge-card-retriever.ts src/modules/knowledge/knowledge-card-retriever.test.ts src/modules/knowledge/external-rag-retriever.ts src/modules/knowledge/external-rag-retriever.test.ts src/modules/knowledge/sample-knowledge-cards.ts src/modules/assistant/create-assistant-runtime.ts
git commit -m "refactor: unify knowledge providers for contextual assistant"
```

---

### 任务 5：为事务 provider 增加 action 与 availability 元数据

**文件：**
- 修改：`src/modules/tasks/task-catalog.service.ts`
- 修改：`src/modules/tasks/task-catalog.service.test.ts`
- 修改：`src/modules/tasks/sample-task-catalog.ts`

- [ ] **步骤 1：先写失败的事务 provider 测试**

覆盖：

- URL 型事务结果包含 `actionType: "url"`
- 不可办理事务返回 `availability: "unavailable"`
- 不可办理时返回明确原因，而不是给一个误导性的入口

示例：

```ts
expect(result).toMatchObject({
  actionType: "url",
  availability: "available"
});
```

- [ ] **步骤 2：运行测试，确认先失败**

运行：`npm test -- --run src/modules/tasks/task-catalog.service.test.ts`

预期：FAIL，因为当前 provider 还不能表达 action type 或 availability。

- [ ] **步骤 3：扩展样例目录与解析逻辑**

补充最小字段：

```ts
actionType: "url";
availability: "available";
availabilityReason?: undefined;
```

并至少增加一个不可办理的样例事务，用于证明契约可用。

- [ ] **步骤 4：重新运行测试，确认通过**

运行：`npm test -- --run src/modules/tasks/task-catalog.service.test.ts`

预期：PASS

- [ ] **步骤 5：提交事务 provider 增强**

```bash
git add src/modules/tasks/task-catalog.service.ts src/modules/tasks/task-catalog.service.test.ts src/modules/tasks/sample-task-catalog.ts
git commit -m "feat: add task availability metadata"
```

---

### 任务 6：将 switch 路由器替换为基于决策结果的工具编排

**文件：**
- 修改：`src/modules/router/request-router.ts`
- 修改：`src/modules/router/request-router.test.ts`
- 修改：`src/modules/assistant/assistant.types.ts`
- 修改：`src/modules/assistant/assistant.service.ts`
- 修改：`src/modules/assistant/assistant.service.test.ts`
- 修改：`src/modules/handoff/handoff.service.ts`
- 修改：`src/modules/handoff/handoff.service.test.ts`

- [ ] **步骤 1：先写失败的编排测试**

覆盖：

- `mode=knowledge` 且 `needKnowledge=true` 时调用知识 provider
- `mode=task` 且 `needTaskResolution=true` 时调用事务 provider
- `mode=chat` 时绕过工具
- `mode=clarify` 时绕过工具并携带 `clarifyQuestion`
- 知识/事务无命中时返回引导元数据，而不是旧版 handoff-only 输出

- [ ] **步骤 2：运行测试，确认先失败**

运行：`npm test -- --run src/modules/router/request-router.test.ts src/modules/assistant/assistant.service.test.ts src/modules/handoff/handoff.service.test.ts`

预期：FAIL，因为当前 router 仍然按旧意图枚举分支，service 也仍然只接收单个字符串 query。

- [ ] **步骤 3：写最小编排重构**

把 router 的输入/输出整理成类似：

```ts
type AssistantExecutionResult =
  | { mode: "knowledge"; knowledge: KnowledgeSearchResult }
  | { mode: "task"; task: TaskResolveResult }
  | { mode: "chat" }
  | { mode: "clarify"; clarifyQuestion: string };
```

`handoff.service.ts` 只在它还能提供一个清晰可复用的“是否建议转人工”能力时保留；如果不再适合主链路，就从运行时路径移除。

- [ ] **步骤 4：重新运行编排测试，确认通过**

运行：`npm test -- --run src/modules/router/request-router.test.ts src/modules/assistant/assistant.service.test.ts src/modules/handoff/handoff.service.test.ts`

预期：PASS

- [ ] **步骤 5：提交工具编排重构**

```bash
git add src/modules/router/request-router.ts src/modules/router/request-router.test.ts src/modules/assistant/assistant.types.ts src/modules/assistant/assistant.service.ts src/modules/assistant/assistant.service.test.ts src/modules/handoff/handoff.service.ts src/modules/handoff/handoff.service.test.ts
git commit -m "refactor: route assistant flows from decision results"
```

---

### 任务 7：增加基于工具事实的回复生成层

**文件：**
- 创建：`src/modules/assistant/response-generator.ts`
- 创建：`src/modules/assistant/response-generator.test.ts`
- 修改：`src/modules/assistant/reply-builder.ts`
- 修改：`src/modules/assistant/reply-builder.test.ts`
- 修改：`src/modules/assistant/assistant.service.ts`
- 修改：`src/modules/assistant/create-assistant-runtime.ts`

- [ ] **步骤 1：先写失败的回复生成测试**

覆盖：

- `chat` 模式返回自然的模型回复
- `clarify` 模式使用模型给出的澄清问题
- `knowledge` 模式包含基于工具事实的回答与来源引用
- `task` 模式包含真实入口 / action 元数据
- 生成失败时会回退到最小本地文本兜底

示例：

```ts
expect(reply).toContain("依据《年假规则》");
expect(reply).toContain("https://oa.example.com/tasks/leave-application");
```

- [ ] **步骤 2：运行测试，确认先失败**

运行：`npm test -- --run src/modules/assistant/response-generator.test.ts src/modules/assistant/reply-builder.test.ts src/modules/assistant/assistant.service.test.ts`

预期：FAIL，因为当前还没有模型驱动的回复生成层。

- [ ] **步骤 3：实现最小可用的 response generator**

新增模块，输入包括：

- 当前消息
- 最近几轮上下文
- `AssistantDecision`
- 工具执行结果

实现逻辑：

- 构建带硬边界的 prompt，把 provider 结果作为事实输入
- 让模型生成最终用户可见回复
- 只有在生成失败时，才回退到 `reply-builder.ts`

代码里要显式保留 grounding 注释，例如：

```ts
// Facts from providers are authoritative; do not invent links or policies.
```

- [ ] **步骤 4：重新运行回复测试，确认通过**

运行：`npm test -- --run src/modules/assistant/response-generator.test.ts src/modules/assistant/reply-builder.test.ts src/modules/assistant/assistant.service.test.ts`

预期：PASS

- [ ] **步骤 5：提交回复生成层**

```bash
git add src/modules/assistant/response-generator.ts src/modules/assistant/response-generator.test.ts src/modules/assistant/reply-builder.ts src/modules/assistant/reply-builder.test.ts src/modules/assistant/assistant.service.ts src/modules/assistant/create-assistant-runtime.ts
git commit -m "feat: generate contextual assistant replies from tool facts"
```

---

### 任务 8：让 Channel 与运行时入口透传 session 身份

**文件：**
- 修改：`src/modules/dingtalk/stream-handler.ts`
- 修改：`src/modules/dingtalk/stream-handler.test.ts`
- 修改：`src/modules/dingtalk/stream-client.ts`
- 修改：`src/modules/dingtalk/stream-client.test.ts`
- 修改：`src/app/api/dingtalk/webhook/route.ts`
- 修改：`src/app/api/dingtalk/webhook/route.test.ts`
- 修改：`docs/dingtalk-stream-setup.md`

- [ ] **步骤 1：先写失败的集成测试**

覆盖：

- Stream 消息会把稳定的 `sessionId` 传给 assistant
- Webhook 调试调用可以显式提供测试 session id
- 知识 / 事务 / 聊天链路在新输入结构下仍能正常回复

示例：

```ts
expect(assistant.reply).toHaveBeenCalledWith({
  message: "那请假怎么申请",
  sessionId: "session-123"
});
```

- [ ] **步骤 2：运行测试，确认先失败**

运行：`npm test -- --run src/modules/dingtalk/stream-handler.test.ts src/modules/dingtalk/stream-client.test.ts src/app/api/dingtalk/webhook/route.test.ts`

预期：FAIL，因为当前 Channel 契约仍然只传一个字符串 query。

- [ ] **步骤 3：把 richer request shape 串到入口层**

为每个入口选择最合适的会话身份：

- stream：优先使用会话级 webhook 或 payload 中更稳定的 conversation 标识
- webhook：使用请求体字段，或提供确定性的调试兜底

并在 `docs/dingtalk-stream-setup.md` 中说明新的调试请求结构。

- [ ] **步骤 4：重新运行集成测试，确认通过**

运行：`npm test -- --run src/modules/dingtalk/stream-handler.test.ts src/modules/dingtalk/stream-client.test.ts src/app/api/dingtalk/webhook/route.test.ts`

预期：PASS

- [ ] **步骤 5：提交入口接线改动**

```bash
git add src/modules/dingtalk/stream-handler.ts src/modules/dingtalk/stream-handler.test.ts src/modules/dingtalk/stream-client.ts src/modules/dingtalk/stream-client.test.ts src/app/api/dingtalk/webhook/route.ts src/app/api/dingtalk/webhook/route.test.ts docs/dingtalk-stream-setup.md
git commit -m "feat: wire session-aware contextual assistant entry points"
```

---

### 任务 9：执行最终验证

**文件：**
- 仅在必要时修改：前面任务中已经触达的文件

- [ ] **步骤 1：运行聚焦后的助手测试套件**

运行：

```bash
npm test -- --run \
  src/modules/intents/intent-analyzer.test.ts \
  src/modules/intents/model-intent-classifier.test.ts \
  src/modules/logging/conversation-log.repository.test.ts \
  src/modules/logging/conversation-context.service.test.ts \
  src/modules/knowledge/knowledge-card-retriever.test.ts \
  src/modules/knowledge/external-rag-retriever.test.ts \
  src/modules/tasks/task-catalog.service.test.ts \
  src/modules/router/request-router.test.ts \
  src/modules/assistant/reply-builder.test.ts \
  src/modules/assistant/response-generator.test.ts \
  src/modules/assistant/assistant.service.test.ts \
  src/modules/dingtalk/stream-handler.test.ts \
  src/modules/dingtalk/stream-client.test.ts \
  src/app/api/dingtalk/webhook/route.test.ts
```

预期：PASS

- [ ] **步骤 2：跑一次人工 smoke 测试**

运行：`npm run stream:dev`

预期：Stream 客户端能在启用模型的新运行时下正常启动，并在手工测试消息时输出决策与回复生成日志。

- [ ] **步骤 3：如果 smoke 测试暴露文档缺口，再更新文档**

只允许修改：

- `docs/dingtalk-stream-setup.md`
- `README.md`

前提是：实际实现与计划中的运行时结构或调试方式出现差异。

- [ ] **步骤 4：提交验证收尾改动**

```bash
git add docs/dingtalk-stream-setup.md README.md
git commit -m "docs: finalize contextual assistant runtime notes"
```
