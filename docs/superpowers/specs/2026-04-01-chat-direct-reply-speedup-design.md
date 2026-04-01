# 聊天意图单次调用直返设计

> 日期：2026-04-01
> 状态：Active
> 适用范围：员工助手意图识别链路、开放聊天回复链路、Webhook Debug 观测
> 前序背景：[2026-03-28-contextual-assistant-decision-design.md](./2026-03-28-contextual-assistant-decision-design.md)

---

## 0. 设计目标

本次优化只解决一个明确问题：

**当用户意图属于 `open_response`（含简单问候、身份说明、能力说明与通用开放问答）时，系统不应先做一次意图识别，再额外发起一次 chat 回复生成，而应在本次意图识别调用中直接产出最终回复。**

目标收益：

1. 将 `open_response` 场景从两次模型调用压缩为一次
2. 保持 `internal_knowledge / task / clarify` 现有链路不变
3. 保留会话日志、上下文连续性与 debug 可观测性
4. 用最小改动完成提速，不做不必要的架构重写

---

## 1. 背景与当前瓶颈

当前助手链路大致如下：

`analyze intent -> route request -> generate response -> return reply`

现状里存在一个典型的性能浪费：

- `model-intent-classifier` 先调用一次模型，判断本轮是 `internal_knowledge / task / open_response / clarify`
- 即使已经判定为 `open_response`，系统仍会继续进入 `responseGenerator` 再调用一次 `/chat/completions`
- 对于“你好”“你是谁”“你能做什么”“北京七日游攻略”这类本来就不需要工具的请求，这第二次调用只是在补一个最终文案

这导致开放聊天场景存在明显的额外时延，而这类问题本质上没有必要走“决策一次，再生成一次”的双调用模式。

---

## 2. 本次范围与边界

### 2.1 In Scope

本次优化只覆盖以下场景：

- `open_response`
- 简单问候与助手身份/能力说明类请求，统一仍归入 `open_response`

典型例子：

- “你好”
- “在吗”
- “你是谁”
- “你能做什么”
- “北京七日游攻略”
- “番茄炒蛋怎么做”

这些请求的共同点是：

- 不依赖公司内部知识库
- 不依赖事务目录或 OA 入口
- 不需要澄清问题后再继续
- 可以由模型在单次调用中直接自然作答

### 2.2 Out of Scope

以下链路不在本次优化范围内：

- `internal_knowledge` 的知识检索与回复组织
- `task` 的事务解析、入口生成与办理说明
- `clarify` 的补问逻辑
- `responseGenerator` 在工具型场景中的职责重构
- 对顶层架构做统一 orchestrator 改写
- 新增新的意图枚举或新的聊天服务

---

## 3. 方案对比

### 方案 A：意图识别顺带产出最终回复（采用）

做法：

- 扩展意图识别返回结构，在 `mode === open_response` 时允许携带 `reply`
- assistant service 检测到 `open_response + reply` 后直接返回
- 不再进入 router 和 response generator

优点：

- 提速收益最大，真正减少一次模型调用
- 改动集中，兼容现有架构
- 不影响知识、事务、澄清链路

缺点：

- 意图识别层不再是绝对“纯决策器”，会承担开放聊天场景的最终文案输出

### 方案 B：把决策器和聊天回复器重构为统一入口（不采用）

优点：

- 长期语义更统一

缺点：

- 重构面过大
- 不符合当前“只优化访问速度”的目标

### 方案 C：仅对简单问候做本地规则快路径（不采用）

优点：

- 改动最小

缺点：

- 收益有限
- 无法覆盖更广泛的 `open_response` 场景

**结论：采用方案 A。**

---

## 4. 核心设计

### 4.1 数据契约调整

当前 `AssistantDecision` 只承载结构化决策结果。本次在保持原有字段不变的基础上，新增一个可选字段：

```ts
type AssistantDecision = {
  mode: "internal_knowledge" | "task" | "open_response" | "clarify";
  intentConfidence: number;
  needKnowledge: boolean;
  needTaskResolution: boolean;
  toolPlan: "none" | "knowledge" | "task";
  topicShift: boolean;
  contextBreakConfidence?: number;
  clarifyQuestion?: string;
  knowledgeHint?: string;
  taskHint?: string;
  reply?: string;
};
```

新增字段约束：

- `reply` 仅用于 `open_response`
- `reply` 表示本轮最终可直接返回给用户的文本
- `task / internal_knowledge / clarify` 不应保留 `reply`
- 纯空白字符串等同于未返回

这样可以把“开放聊天场景的最终结果”明确建模进现有决策结构，而不新增平行数据通道。

### 4.2 简单问候归并策略

本次不新增 `greeting` 等新 mode。

简单问候、身份说明和能力说明统一继续归入 `open_response`，例如：

- 你好
- 在吗
- 你是谁
- 你能做什么

这样做的原因是：

- 这些请求本质上仍然是不需要工具的直接回复
- 不值得为其新增顶层意图枚举和额外分支
- 保持 `open_response` 语义完整，更符合 KISS / YAGNI

### 4.3 模型提示词行为边界

`model-intent-classifier` 的提示词需要从“只判断 mode”升级为“对 `open_response` 同时产出 reply”。

具体规则如下：

1. 当请求属于 `open_response` 时：
   - 必须返回 `reply`
   - `toolPlan` 必须为 `none`
   - `needKnowledge` 与 `needTaskResolution` 必须为 `false`
2. 当请求属于 `internal_knowledge / task / clarify` 时：
   - 不应返回 `reply`
3. 当用户表达不清或目标不稳定时：
   - 仍返回 `clarify`
4. 当用户在问公司制度、规则、适用范围、办理方式时：
   - 仍优先走工具链，不允许误判成 `open_response`

这意味着模型需要同时遵守两个判断标准：

- **是否需要公司工具能力**
- **是否可以在当前调用直接完成回答**

### 4.4 few-shot 补强方向

为减少回复缺失和误判，需要在决策提示词中补充如下示例风格：

- “你好” -> `open_response + reply`
- “你能做什么” -> `open_response + reply`
- “北京七日游攻略” -> `open_response + reply`
- “我要请假” -> 仍为 `task`，不带 `reply`
- “病假工资怎么算” -> 仍为 `internal_knowledge`，不带 `reply`
- “这个怎么办” -> `clarify`

通过 few-shot 明确告诉模型：

- `open_response` 是终态回复，不是中间态占位
- 工具型模式依然只输出结构化决策，不直接替代工具结果

---

## 5. 服务层链路调整

### 5.1 新的开放聊天快路径

assistant service 在拿到 `resolvedIntent` 后，增加一个短路出口：

如果满足以下条件：

- `resolvedIntent.mode === "open_response"`
- `resolvedIntent.reply` 存在且非空

则直接：

1. 构造 `open_response` resolution
2. 使用该 `reply` 作为最终输出
3. 跳过 `requestRouter.route(...)`
4. 跳过 `responseGenerator.generate(...)`
5. 返回 debug 结果，并标记 `usedResponseGenerator = false`

于是开放聊天链路变为：

`analyze(+reply) -> direct return`

而不再是：

`analyze -> route -> generate -> return`

### 5.2 非聊天链路保持不变

以下模式继续保持当前处理方式：

- `internal_knowledge` -> router -> knowledge retriever -> response generator / reply builder
- `task` -> router -> task catalog -> response generator / reply builder
- `clarify` -> clarification resolution -> response generator / reply builder

也就是说，这次优化是对开放聊天路径做“提前返回”，而不是重写整个 assistant 编排层。

### 5.3 回退策略

为了保证稳定性，新增快路径必须具备回退能力。

#### 情况 A：`open_response + reply`

- 命中新快路径
- 直接返回
- 不调用 response generator

#### 情况 B：`open_response` 但没有 `reply`

- 不报错
- 回退到当前旧链路
- 由 router 输出 `open_response` resolution
- 再由 `responseGenerator` 负责生成自然回复

#### 情况 C：模型分类失败或结构化结果不可用

- 保持现有 fallback clarify 行为
- 不扩大本次改动范围

这套回退设计的核心原则是：

**优先提速，但不允许因为 reply 缺失而把聊天场景变成空回复。**

---

## 6. 会话、日志与观测约束

### 6.1 会话上下文不能被绕过

即使开放聊天走快路径，也必须继续保留：

- 用户消息写日志
- 助手回复写日志
- ConversationContextService 的后续可读取性

否则虽然本轮提速了，但会破坏连续对话体验，得不偿失。

### 6.2 Debug 输出要能体现是否命中快路径

当前 debug 输出里已有：

- `intent`
- `resolution`
- `usedResponseGenerator`

本次应继续沿用这个契约，并让其能明确表明：

- 命中新快路径时：`usedResponseGenerator = false`
- 回退旧聊天链路时：`usedResponseGenerator = true`
- 工具型场景：按实际情况返回

这样后续可以直接通过 debug 接口验证优化是否生效，而不必依赖外部日志猜测。

---

## 7. 测试设计

### 7.1 意图层测试

重点验证：

1. `open_response` 场景能正确解析 `reply`
2. 非 `open_response` 场景即使模型误带 `reply` 也会被忽略
3. 空白 `reply` 会被视为未返回

### 7.2 assistant service 测试

重点验证：

1. 当 analyzer 返回 `open_response + reply` 时：
   - 直接返回该 reply
   - 不调用 `responseGenerator.generate`
   - `usedResponseGenerator = false`
2. 当 analyzer 返回 `open_response` 但无 `reply` 时：
   - 会回退旧链路
   - 仍可继续走 `responseGenerator`
3. `task / internal_knowledge / clarify` 既有行为不变
4. 快路径场景下用户消息和助手消息仍会写入日志

### 7.3 API 回归测试

如需覆盖 webhook 调试入口，应验证：

- 请求聊天消息时，debug 输出中的 `intent.mode === open_response`
- `resolution.kind === open_response`
- `usedResponseGenerator === false`

---

## 8. 验收标准

本次优化完成后，应满足以下标准：

1. `open_response`（含简单问候、身份说明、能力说明与通用开放问答）场景只发生一次模型调用
2. `internal_knowledge / task / clarify` 行为与现状一致
3. 缺少 `reply` 时能自动回退旧链路，不产生空回复
4. 快路径场景下用户消息与助手回复仍会正常写入日志，并可继续被上下文服务读取
5. debug 输出可明确区分是否命中新快路径
6. 新增测试覆盖直返、回退和非工具链不受影响三类行为

---

## 9. 设计原则说明

本方案刻意采用最小改动策略，理由如下：

- **KISS**：只在现有链路上增加一个清晰的提前返回分支
- **YAGNI**：不重写整个决策与回复编排架构
- **DRY**：不新增平行聊天服务或重复的响应层
- **SOLID**：assistant service 仍负责编排；只是在 `open_response` 场景增加了一个明确定义的快路径

---

## 10. 后续实施提示

进入 implementation plan 时，建议只围绕以下改动展开：

- 扩展 `AssistantDecision` 契约
- 调整 `model-intent-classifier` 的提示词与 JSON 解析
- 在 `assistant.service` 增加 `open_response` 直返分支
- 保持日志、上下文与 debug 契约
- 补充意图层、service 层和 API 层测试

本次优化不应顺手引入新的模式枚举、统一 orchestrator、独立聊天模块或其他额外架构改造。