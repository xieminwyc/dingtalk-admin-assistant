# Chat Direct Reply Speedup Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `open_response`（含简单问候、身份说明、能力说明与通用开放问答）在意图识别这一次模型调用里直接产出最终 `reply`，从而跳过独立 `responseGenerator` 调用并缩短问答时延。

**Architecture:** 保持现有 `intent-analyzer -> assistant.service -> router/responseGenerator` 主链路不变，只在 `AssistantDecision` 上新增可选 `reply` 契约，并在 `model-intent-classifier` 中为 `open_response` 产出该字段。`assistant.service` 增加一个明确的快路径：当 `mode === open_response` 且 `reply` 可用时直接返回，同时继续保留日志、上下文、debug 输出；若 `reply` 缺失则自动回退到现有旧链路。

**Tech Stack:** TypeScript、Next.js App Router、Vitest、基于 fetch 的 SiliconFlow `/chat/completions` 调用

> 约束说明：根据当前全局指令，本计划不包含任何 `git commit`、建分支或其他 Git 写操作步骤。

---

## Spec Reference

- Spec: `docs/superpowers/specs/2026-04-01-chat-direct-reply-speedup-design.md`

## File Structure

| Path | Responsibility |
| --- | --- |
| `src/modules/intents/intent.types.ts` | 扩展 `AssistantDecision`，为 `open_response` 增加可选 `reply` 字段 |
| `src/modules/intents/model-intent-classifier.ts` | 更新决策 prompt、few-shot 与 JSON 解析逻辑，只在 `open_response` 时保留 `reply` |
| `src/modules/intents/model-intent-classifier.test.ts` | 锁定 `reply` 解析、忽略规则与 prompt 约束 |
| `src/modules/assistant/assistant.service.ts` | 增加 `open_response + reply` 直返快路径，并保留日志/上下文/debug 契约 |
| `src/modules/assistant/assistant.service.test.ts` | 锁定直返、不调用 `responseGenerator`、日志写入与回退旧链路行为 |
| `src/app/api/dingtalk/webhook/route.test.ts` | 增加 HTTP/debug 回归，验证 `usedResponseGenerator=false` 且聊天场景只需一次模型调用 |

---

## Chunk 1: Intent contract and service fast path

### Task 1: 扩展决策契约并锁定 classifier 行为

**Files:**
- Modify: `src/modules/intents/intent.types.ts:18-29`
- Modify: `src/modules/intents/model-intent-classifier.ts:80-136`
- Modify: `src/modules/intents/model-intent-classifier.ts:163-279`
- Test: `src/modules/intents/model-intent-classifier.test.ts:75-214`
- Test: `src/modules/intents/model-intent-classifier.test.ts:216-300`

- [ ] **Step 1: 先写失败的 classifier 测试**

在 `src/modules/intents/model-intent-classifier.test.ts` 新增至少 5 个用例：

```ts
it("preserves reply for open_response decisions", async () => {
  const result = await classifier.classify({ query: "你好" });

  expect(result).toEqual(
    expect.objectContaining({
      mode: "open_response",
      toolPlan: "none",
      reply: "你好，我是你的员工助手。"
    })
  );
});

it("preserves reply for general open_response questions", async () => {
  const result = await classifier.classify({ query: "北京七日游攻略" });

  expect(result).toEqual(
    expect.objectContaining({
      mode: "open_response",
      toolPlan: "none",
      reply: expect.any(String)
    })
  );
});

it("drops reply for non-open_response decisions", async () => {
  const result = await classifier.classify({ query: "我要请假" });

  expect(result.mode).toBe("task");
  expect(result).not.toHaveProperty("reply");
});

it("treats blank reply as missing", async () => {
  const result = await classifier.classify({ query: "你好" });

  expect(result.mode).toBe("open_response");
  expect(result).not.toHaveProperty("reply");
});

it("teaches the model to emit reply for open_response", async () => {
  await classifier.classify({ query: "你能做什么" });

  expect(requestBody.messages[0]?.content).toContain("如果 mode 是 open_response，必须返回 reply 字段");
  expect(requestBody.messages[0]?.content).toContain("用户：\"你好\"");
  expect(requestBody.messages[0]?.content).toContain("用户：\"北京七日游攻略\"");
});
```

同时保留现有 fallback 用例，避免因为新增字段影响 clarify 降级行为。重点是把“空白 `reply` 视为未返回”和“通用开放问答也应直接带 `reply`”都锁进测试。

- [ ] **Step 2: 运行定向测试，确认先失败**

Run:
```bash
npm test -- src/modules/intents/model-intent-classifier.test.ts
```

Expected:
- FAIL，原因应包括：`AssistantDecision` 还没有 `reply`
- 或 `extractDecisionFromContent()` 还不会在 `open_response` 时保留 `reply`
- 或 system prompt / few-shot 里还缺少 `reply` 约束文案

- [ ] **Step 3: 写最小实现，让 open_response 带上 reply**

先扩展 `AssistantDecision`：

```ts
export type AssistantDecision = {
  mode: AssistantMode;
  intentConfidence: number;
  needKnowledge: boolean;
  needTaskResolution: boolean;
  toolPlan: AssistantToolPlan;
  topicShift: boolean;
  contextBreakConfidence?: number;
  clarifyQuestion?: string;
  knowledgeHint?: string;
  taskHint?: string;
  reply?: string;
};
```

然后在 `extractDecisionFromContent()` 中只对 `open_response` 保留 `reply`：

```ts
const reply =
  parsed.mode === "open_response" ? pickOptionalText(parsed.reply) : undefined;

return {
  mode: parsed.mode,
  intentConfidence: clampConfidence(parsed.intentConfidence),
  needKnowledge: ...,
  needTaskResolution: ...,
  toolPlan: ...,
  topicShift: Boolean(parsed.topicShift),
  ...(reply ? { reply } : {})
};
```

最后更新 `buildDecisionSystemPrompt()`：

```ts
"如果 mode 是 open_response，必须返回 reply 字段，内容是本轮可以直接发给用户的最终中文回复。",
"如果 mode 不是 open_response，不要返回 reply 字段。",
'用户：“你好” -> {"mode":"open_response",...,"reply":"你好，我是你的员工助手。你可以问我制度规则、办理入口，或者直接告诉我你想办什么。"}',
'用户：“你能做什么” -> {"mode":"open_response",...,"reply":"我可以帮你查公司制度说明、找常用办理入口，也可以先帮你判断问题该查知识还是走流程。"}'
```

实现要求：
- 纯空白 `reply` 视为未返回
- `task / internal_knowledge / clarify` 即使模型误带 `reply` 也必须忽略
- 保持现有 `console.info / console.warn` 行为不变

- [ ] **Step 4: 重新运行 classifier 测试，确认通过**

Run:
```bash
npm test -- src/modules/intents/model-intent-classifier.test.ts
```

Expected:
- PASS
- 现有 clarify fallback、prompt 内容和 open_response 行为断言全部通过

### Task 2: 在 assistant service 中增加聊天直返快路径

**Files:**
- Modify: `src/modules/assistant/assistant.service.ts:57-81`
- Modify: `src/modules/assistant/assistant.service.ts:158-239`
- Test: `src/modules/assistant/assistant.service.test.ts:27-56`
- Test: `src/modules/assistant/assistant.service.test.ts:107-130`
- Test: `src/modules/assistant/assistant.service.test.ts:410-561`

- [ ] **Step 1: 先写失败的 service 测试**

在 `src/modules/assistant/assistant.service.test.ts` 增加至少 4 个用例：

```ts
it("returns open_response directly when analyzer already provides reply", async () => {
  const generate = vi.fn();
  const assistant = createAssistantService({
    localRetriever,
    analyzer: {
      analyze: vi.fn().mockResolvedValue(
        buildIntentAnalysis("open_response", {
          reply: "你好，我是你的员工助手。"
        })
      )
    },
    taskCatalog: createTaskCatalog(),
    responseGenerator: { generate }
  });

  const result = await assistant.replyWithDebug({
    query: "你好",
    sessionId: "session-open-response"
  });

  expect(result.reply).toBe("你好，我是你的员工助手。");
  expect(result.resolution).toEqual({
    kind: "open_response",
    intent: "smalltalk",
    reply: "你好，我是你的员工助手。"
  });
  expect(result.usedResponseGenerator).toBe(false);
  expect(result.conversationContext).toEqual([]);
  expect(generate).not.toHaveBeenCalled();
  expect(routeSpy).not.toHaveBeenCalled();
});

it("persists user and assistant logs for the direct reply fast path", async () => {
  expect(append).toHaveBeenCalledTimes(2);
  expect(append.mock.calls[0]?.[0]).toMatchObject({ role: "user" });
  expect(append.mock.calls[1]?.[0]).toMatchObject({ role: "assistant" });
});

it("falls back to the old open_response path when reply is missing", async () => {
  expect(generate).toHaveBeenCalledTimes(1);
  expect(result.usedResponseGenerator).toBe(true);
});

it("keeps loaded conversation context in the debug result for the direct reply fast path", async () => {
  expect(result.conversationContext).toEqual([
    { role: "user", content: "你能做什么？" }
  ]);
});
```

建议在这组测试里通过 `vi.spyOn(routerModule, "createRequestRouter")` 返回一个带 `route: routeSpy` 的假 router，从而显式锁定“直返场景不会触发 router.route(...)”。同时给快路径场景注入一个 `conversationContextService`，直接断言 `conversationContext` 仍被保留并返回给 debug。
```

如果现有 `buildIntentAnalysis()` helper 还不支持 `reply`，一并在测试辅助函数中加上可选覆盖字段。

- [ ] **Step 2: 运行定向测试，确认先失败**

Run:
```bash
npm test -- src/modules/assistant/assistant.service.test.ts
```

Expected:
- FAIL，原因应包括：`assistant.service` 还没有 `open_response + reply` 提前返回分支
- 或日志断言失败，因为快路径尚未存在
- 或 `usedResponseGenerator` 仍为 `true`

- [ ] **Step 3: 在 assistant.service 中实现快路径与回退策略**

在拿到 `resolvedIntent` 后、调用 `router.route(...)` 前插入早返回逻辑：

```ts
if (resolvedIntent.mode === "open_response" && resolvedIntent.reply?.trim()) {
  const resolution: AssistantResolution = {
    kind: "open_response",
    intent: "smalltalk",
    reply: resolvedIntent.reply
  };
  const reply = resolvedIntent.reply;

  await appendConversationLog({
    sessionId: replyInput.sessionId,
    conversationId: replyInput.conversationId,
    userId: replyInput.userId,
    query: replyInput.query,
    content: replyInput.query,
    role: "user",
    routeType: resolvedIntent.intent,
    routeConfidence: resolvedIntent.intentConfidence
  });
  await appendConversationLog({
    sessionId: replyInput.sessionId,
    conversationId: replyInput.conversationId,
    userId: replyInput.userId,
    query: replyInput.query,
    content: reply,
    role: "assistant",
    routeType: resolution.intent,
    routeConfidence: resolvedIntent.intentConfidence
  });

  return {
    reply,
    conversationContext,
    intent: resolvedIntent,
    resolution,
    usedResponseGenerator: false
  };
}
```

实现要求：
- 必须跳过 `router.route(...)`
- 必须跳过 `responseGenerator.generate(...)`
- 必须继续保留用户/助手日志写入
- 当 `mode === open_response` 但 `reply` 缺失时，继续走现有旧链路，不新增第二套 fallback 逻辑

- [ ] **Step 4: 重新运行 service 测试，确认通过**

Run:
```bash
npm test -- src/modules/assistant/assistant.service.test.ts
```

Expected:
- PASS
- 新增的直返、日志、回退旧链路与 debug 断言全部通过
- 既有 task / knowledge / clarify 用例保持通过

---

## Chunk 2: HTTP regression and verification

### Task 3: 增加 webhook/debug 回归并完成最终验证

**Files:**
- Modify: `src/app/api/dingtalk/webhook/route.test.ts:5-35`
- Modify: `src/app/api/dingtalk/webhook/route.test.ts:128-173`
- Verify: `src/modules/intents/model-intent-classifier.test.ts`
- Verify: `src/modules/assistant/assistant.service.test.ts`
- Verify: `src/app/api/dingtalk/webhook/route.test.ts`

- [ ] **Step 1: 先补一个聊天直返的 HTTP/debug 回归测试**

在 `route.test.ts` 的 mock 决策结果里增加“你好”分支：

```ts
function buildDecisionPayload(query: string) {
  if (query.includes("你好")) {
    return {
      mode: "open_response",
      intentConfidence: 0.98,
      needKnowledge: false,
      needTaskResolution: false,
      toolPlan: "none",
      topicShift: false,
      reply: "你好，我是你的员工助手。你可以问我制度规则、办理入口，或者直接告诉我你想办什么。"
    };
  }

  // existing task / internal_knowledge branches...
}
```

然后新增测试，但要先重建模块级 runtime，避免 `route.ts` 顶部静态导入带来的单例污染：

```ts
it("returns a direct open_response debug payload without a second model call", async () => {
  vi.resetModules();
  vi.restoreAllMocks();

  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    const requestBody = JSON.parse(String(init?.body ?? "{}"));
    const query = requestBody.messages?.[1]?.content?.split("当前用户消息：")[1]?.trim() ?? "";
    const systemPrompt = requestBody.messages?.[0]?.content ?? "";

    if (String(systemPrompt).includes("回复生成器")) {
      throw new Error("response generator should not be called for direct open_response");
    }

    return Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify(buildDecisionPayload(query))
          }
        }
      ]
    });
  });

  const { POST: freshPost } = await import("./route");
  const request = new Request("http://localhost/api/dingtalk/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      debug: true,
      sessionId: "page-debug-open-response",
      text: { content: "你好" }
    })
  });

  const response = await freshPost(request);
  const data = await response.json();

  expect(response.status).toBe(200);
  expect(data.reply).toContain("你好，我是你的员工助手");
  expect(data.debug?.intent?.mode).toBe("open_response");
  expect(data.debug?.resolution?.kind).toBe("open_response");
  expect(data.debug?.usedResponseGenerator).toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
```

这里的 `vi.resetModules()` + 重新 `import("./route")` 很关键，它能确保测试读取的是本用例新创建的 runtime，而不是之前用例遗留的模块级 `assistantRuntime`。在这个前提下，`fetch` 次数断言才真正能锁定“聊天场景只调用一次模型”。

- [ ] **Step 2: 运行 route 回归测试，确认当前实现满足预期**

Run:
```bash
npm test -- src/app/api/dingtalk/webhook/route.test.ts
```

Expected:
- PASS
- 新增 open_response debug 回归通过
- 既有 task / knowledge / empty message / entryMode 透传回归全部通过

- [ ] **Step 3: 运行三组关键测试做最终验证**

Run:
```bash
npm test -- src/modules/intents/model-intent-classifier.test.ts src/modules/assistant/assistant.service.test.ts src/app/api/dingtalk/webhook/route.test.ts
```

Expected:
- PASS
- `open_response`（含简单问候）场景只需一次模型调用
- `internal_knowledge / task / clarify` 现有行为不变
- 缺少 `reply` 时会自动回退旧链路
- 快路径场景下日志、上下文与 debug 契约保持有效

- [ ] **Step 4: 记录完成标准，准备进入执行阶段**

确认以下验收事实都已被测试覆盖：

```txt
1. open_response + 简单问候 = 单次模型调用
2. internal_knowledge / task / clarify 无回归
3. reply 缺失时自动回退旧链路
4. direct reply 快路径仍保留日志与上下文连续性
5. debug 输出可见 usedResponseGenerator=false
```

---

Plan complete and saved to `docs/superpowers/plans/2026-04-01-chat-direct-reply-speedup-implementation.md`. Ready to execute?