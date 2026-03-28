# 上下文驱动员工助手重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current rule-first routing assistant with a context-aware, model-led decision flow that can choose between knowledge, task, chat, and clarify modes, call tools when needed, and generate natural final replies grounded in tool facts.

**Architecture:** Keep the DingTalk stream/webhook entry points and `assistant.service` as the main runtime boundary, but replace the current “intent enum -> switch router -> local template” flow with a session-scoped conversation context layer, a model-driven Decision Engine, unified knowledge/task provider contracts, and a response generation layer that turns tool facts into natural replies. Ship the refactor incrementally so the project stays testable after every task.

**Tech Stack:** Node.js, TypeScript, Next.js App Router, Vitest, DingTalk Stream SDK, Zod, dotenv, fetch-based LLM integration

---

## Scope

This plan implements the approved spec in [`docs/superpowers/specs/2026-03-28-contextual-assistant-decision-design.md`](/Users/xiemin/monter/dingtalk-admin-assistant/docs/superpowers/specs/2026-03-28-contextual-assistant-decision-design.md):

- Replace `knowledge_query / task_request / handoff_request / smalltalk / unknown` with `knowledge / task / chat / clarify`
- Make the LLM the primary decision maker
- Add session-scoped conversation context and topic-shift handling
- Unify local seed knowledge, uploaded-document-ready boundaries, and external RAG behind one knowledge provider contract
- Enrich task results with `actionType`, `availability`, and better follow-up metadata
- Replace rigid reply templates with model-generated replies grounded in provider facts

This plan does not implement:

- Real DingTalk OA launch APIs
- Document upload UI or persistent document ingestion pipeline
- Vector database / reranker infrastructure
- Long-term memory or cross-session personalization

## Plan File Structure

| Path | Responsibility |
| --- | --- |
| `src/modules/intents/intent.types.ts` | New top-level assistant mode and `AssistantDecision` contract |
| `src/modules/intents/intent-analyzer.ts` | Session-aware Decision Engine adapter |
| `src/modules/intents/intent-analyzer.test.ts` | Decision Engine behavior, confidence, topic-shift tests |
| `src/modules/intents/model-intent-classifier.ts` | LLM client for decision JSON |
| `src/modules/intents/model-intent-classifier.test.ts` | Decision-model request/response normalization tests |
| `src/modules/logging/conversation-log.types.ts` | Session-aware message log contract |
| `src/modules/logging/conversation-log.repository.ts` | Store/retrieve recent turns for one session |
| `src/modules/logging/conversation-log.repository.test.ts` | Log persistence and context retrieval tests |
| `src/modules/logging/conversation-context.service.ts` | Build bounded recent context from stored logs |
| `src/modules/logging/conversation-context.service.test.ts` | Context window, TTL, and topic reset tests |
| `src/modules/knowledge/retriever.types.ts` | Unified knowledge provider input/output contracts |
| `src/modules/knowledge/knowledge-card-retriever.ts` | Seed provider with `referenceLabel` and `relatedKeywords` |
| `src/modules/knowledge/knowledge-card-retriever.test.ts` | Seed knowledge provider behavior |
| `src/modules/knowledge/external-rag-retriever.ts` | External RAG provider contract adapter |
| `src/modules/knowledge/external-rag-retriever.test.ts` | RAG normalization tests |
| `src/modules/tasks/task-catalog.types.ts` | Enriched task provider contract |
| `src/modules/tasks/task-catalog.service.ts` | Task provider with availability/action metadata |
| `src/modules/tasks/task-catalog.service.test.ts` | Task provider resolution tests |
| `src/modules/router/request-router.ts` | Coordinate tool execution from `AssistantDecision` |
| `src/modules/router/request-router.test.ts` | Decision-to-tool orchestration tests |
| `src/modules/assistant/assistant.types.ts` | Assistant execution result and response input shapes |
| `src/modules/assistant/reply-builder.ts` | Emergency text fallback only, if generation fails |
| `src/modules/assistant/reply-builder.test.ts` | Fallback-only text formatting tests |
| `src/modules/assistant/response-generator.ts` | Natural-language response generation grounded in tool facts |
| `src/modules/assistant/response-generator.test.ts` | Response prompt shaping and fallback tests |
| `src/modules/assistant/assistant.service.ts` | Main orchestration: load context -> decide -> run tools -> generate reply |
| `src/modules/assistant/assistant.service.test.ts` | End-to-end assistant orchestration tests |
| `src/modules/assistant/create-assistant-runtime.ts` | Wire Decision Engine, providers, context service, generator |
| `src/modules/dingtalk/stream-handler.ts` | Capture session identity and pass richer assistant input |
| `src/modules/dingtalk/stream-handler.test.ts` | Stream session/context handoff tests |
| `src/modules/dingtalk/stream-client.ts` | Keep stream entry aligned with the new runtime |
| `src/modules/dingtalk/stream-client.test.ts` | Stream integration tests |
| `src/app/api/dingtalk/webhook/route.ts` | HTTP debug route aligned with richer assistant input |
| `src/app/api/dingtalk/webhook/route.test.ts` | Webhook integration tests |
| `docs/dingtalk-stream-setup.md` | Runtime and debugging docs for the new model-led flow |

---

### Task 1: Lock the new decision and provider contracts

**Files:**
- Modify: `src/modules/intents/intent.types.ts`
- Modify: `src/modules/assistant/assistant.types.ts`
- Modify: `src/modules/knowledge/retriever.types.ts`
- Modify: `src/modules/tasks/task-catalog.types.ts`
- Test: `src/modules/assistant/reply-builder.test.ts`
- Test: `src/modules/tasks/task-catalog.service.test.ts`
- Test: `src/modules/knowledge/external-rag-retriever.test.ts`

- [ ] **Step 1: Write the failing contract tests**

Add assertions for the new shapes:

```ts
expectTypeOf<AssistantMode>().toEqualTypeOf<
  "knowledge" | "task" | "chat" | "clarify"
>();
expect(result.availability).toBe("available");
expect(hits[0]?.referenceLabel).toBe("年假制度");
```

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run: `npm test -- --run src/modules/assistant/reply-builder.test.ts src/modules/tasks/task-catalog.service.test.ts src/modules/knowledge/external-rag-retriever.test.ts`
Expected: FAIL because the current contracts still use the old intent enum and provider shapes.

- [ ] **Step 3: Write the minimal contract changes**

Update the types to introduce:

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

Also expand provider result contracts with:

```ts
referenceLabel?: string;
relatedKeywords?: string[];
actionType?: "url" | "api";
availability?: "available" | "unavailable" | "unknown";
availabilityReason?: string;
```

- [ ] **Step 4: Re-run the focused tests and confirm they pass**

Run: `npm test -- --run src/modules/assistant/reply-builder.test.ts src/modules/tasks/task-catalog.service.test.ts src/modules/knowledge/external-rag-retriever.test.ts`
Expected: PASS

- [ ] **Step 5: Commit the contract lock-in**

```bash
git add src/modules/intents/intent.types.ts src/modules/assistant/assistant.types.ts src/modules/knowledge/retriever.types.ts src/modules/tasks/task-catalog.types.ts src/modules/assistant/reply-builder.test.ts src/modules/tasks/task-catalog.service.test.ts src/modules/knowledge/external-rag-retriever.test.ts
git commit -m "refactor: define contextual assistant contracts"
```

---

### Task 2: Add session-scoped conversation context retrieval

**Files:**
- Modify: `src/modules/logging/conversation-log.types.ts`
- Modify: `src/modules/logging/conversation-log.repository.ts`
- Modify: `src/modules/logging/conversation-log.repository.test.ts`
- Create: `src/modules/logging/conversation-context.service.ts`
- Create: `src/modules/logging/conversation-context.service.test.ts`

- [ ] **Step 1: Write the failing context-window tests**

Cover:

- append user/assistant turns with a `sessionId`
- retrieve only the most recent N turns
- drop expired turns when TTL is exceeded
- never leak records from another session

Example:

```ts
expect(await service.loadRecentContext("session-a")).toEqual([
  { role: "user", content: "你能做什么？" },
  { role: "assistant", content: "我可以帮你查制度..." }
]);
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test -- --run src/modules/logging/conversation-log.repository.test.ts src/modules/logging/conversation-context.service.test.ts`
Expected: FAIL because the repository cannot yet store speaker/response data or return bounded context.

- [ ] **Step 3: Extend the log record and add the context service**

Expand the log contract with minimal fields:

```ts
sessionId: string;
role: "user" | "assistant";
content: string;
decisionMode?: AssistantMode;
referenceLabel?: string | null;
```

Then implement `conversation-context.service.ts` with:

```ts
loadRecentContext(sessionId: string, options?: { maxTurns?: number; ttlMs?: number })
```

Keep the service purely synchronous on top of repository reads if possible.

- [ ] **Step 4: Re-run the tests and confirm they pass**

Run: `npm test -- --run src/modules/logging/conversation-log.repository.test.ts src/modules/logging/conversation-context.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit the context layer**

```bash
git add src/modules/logging/conversation-log.types.ts src/modules/logging/conversation-log.repository.ts src/modules/logging/conversation-log.repository.test.ts src/modules/logging/conversation-context.service.ts src/modules/logging/conversation-context.service.test.ts
git commit -m "feat: add session conversation context service"
```

---

### Task 3: Replace the old intent classifier with a model-led Decision Engine

**Files:**
- Modify: `src/modules/intents/intent-analyzer.ts`
- Modify: `src/modules/intents/intent-analyzer.test.ts`
- Modify: `src/modules/intents/model-intent-classifier.ts`
- Modify: `src/modules/intents/model-intent-classifier.test.ts`
- Modify: `src/modules/assistant/create-assistant-runtime.ts`

- [ ] **Step 1: Write the failing Decision Engine tests**

Cover:

- `你是谁` -> `chat`
- `那请假怎么申请` with prior chat context -> `task`
- `那明天下雨吗？` after a task flow -> `chat` with `topicShift=true`
- low-confidence ambiguous input -> `clarify`

Example:

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

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test -- --run src/modules/intents/intent-analyzer.test.ts src/modules/intents/model-intent-classifier.test.ts`
Expected: FAIL because the current implementation still returns the old five-intent enum.

- [ ] **Step 3: Rewrite the decision contracts and prompt**

Change the model client so it requests decision JSON such as:

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

Update the prompt to explicitly cover:

- context-aware mode selection
- topic-shift detection
- low-confidence -> `clarify`
- no legacy `handoff_request` / `unknown` labels

- [ ] **Step 4: Keep only the smallest possible fallback**

If the model request fails or returns invalid JSON, return:

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

Do not reintroduce keyword-first routing.

- [ ] **Step 5: Re-run the tests and confirm they pass**

Run: `npm test -- --run src/modules/intents/intent-analyzer.test.ts src/modules/intents/model-intent-classifier.test.ts`
Expected: PASS

- [ ] **Step 6: Commit the Decision Engine rewrite**

```bash
git add src/modules/intents/intent-analyzer.ts src/modules/intents/intent-analyzer.test.ts src/modules/intents/model-intent-classifier.ts src/modules/intents/model-intent-classifier.test.ts src/modules/assistant/create-assistant-runtime.ts
git commit -m "refactor: add model-led assistant decision engine"
```

---

### Task 4: Unify seed knowledge and external RAG behind one provider shape

**Files:**
- Modify: `src/modules/knowledge/knowledge-card-retriever.ts`
- Modify: `src/modules/knowledge/knowledge-card-retriever.test.ts`
- Modify: `src/modules/knowledge/external-rag-retriever.ts`
- Modify: `src/modules/knowledge/external-rag-retriever.test.ts`
- Modify: `src/modules/knowledge/sample-knowledge-cards.ts`
- Modify: `src/modules/assistant/create-assistant-runtime.ts`

- [ ] **Step 1: Write the failing provider tests**

Cover:

- seed knowledge returns `referenceLabel`
- misses return `relatedKeywords`
- external RAG results normalize into the same shape

Example:

```ts
expect(hits[0]).toMatchObject({
  source: "seed",
  referenceLabel: "年假规则"
});
expect(result.relatedKeywords).toEqual(["年假折现", "离职补偿"]);
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test -- --run src/modules/knowledge/knowledge-card-retriever.test.ts src/modules/knowledge/external-rag-retriever.test.ts`
Expected: FAIL because providers do not yet expose the richer metadata.

- [ ] **Step 3: Write the minimal provider changes**

Update the seed provider to:

- map sample cards to `source: "seed"`
- expose `referenceLabel`
- compute simple `relatedKeywords` from card keywords/title when no hit is found

Update the external RAG adapter to normalize:

```ts
source: "rag";
referenceLabel: document.title;
relatedKeywords?: [];
```

- [ ] **Step 4: Re-run the tests and confirm they pass**

Run: `npm test -- --run src/modules/knowledge/knowledge-card-retriever.test.ts src/modules/knowledge/external-rag-retriever.test.ts`
Expected: PASS

- [ ] **Step 5: Commit the knowledge provider unification**

```bash
git add src/modules/knowledge/knowledge-card-retriever.ts src/modules/knowledge/knowledge-card-retriever.test.ts src/modules/knowledge/external-rag-retriever.ts src/modules/knowledge/external-rag-retriever.test.ts src/modules/knowledge/sample-knowledge-cards.ts src/modules/assistant/create-assistant-runtime.ts
git commit -m "refactor: unify knowledge providers for contextual assistant"
```

---

### Task 5: Enrich the task provider with action and availability metadata

**Files:**
- Modify: `src/modules/tasks/task-catalog.service.ts`
- Modify: `src/modules/tasks/task-catalog.service.test.ts`
- Modify: `src/modules/tasks/sample-task-catalog.ts`

- [ ] **Step 1: Write the failing task-provider tests**

Cover:

- URL-backed task results include `actionType: "url"`
- unavailable tasks return `availability: "unavailable"`
- unavailable tasks surface a reason instead of a misleading entry

Example:

```ts
expect(result).toMatchObject({
  actionType: "url",
  availability: "available"
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test -- --run src/modules/tasks/task-catalog.service.test.ts`
Expected: FAIL because the current provider cannot express action type or availability.

- [ ] **Step 3: Extend the sample catalog and resolver**

Add minimal fields:

```ts
actionType: "url";
availability: "available";
availabilityReason?: undefined;
```

Add at least one sample case for an unavailable task to prove the contract works.

- [ ] **Step 4: Re-run the tests and confirm they pass**

Run: `npm test -- --run src/modules/tasks/task-catalog.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit the task provider enrichment**

```bash
git add src/modules/tasks/task-catalog.service.ts src/modules/tasks/task-catalog.service.test.ts src/modules/tasks/sample-task-catalog.ts
git commit -m "feat: add task availability metadata"
```

---

### Task 6: Replace the switch router with decision-driven tool orchestration

**Files:**
- Modify: `src/modules/router/request-router.ts`
- Modify: `src/modules/router/request-router.test.ts`
- Modify: `src/modules/assistant/assistant.types.ts`
- Modify: `src/modules/assistant/assistant.service.ts`
- Modify: `src/modules/assistant/assistant.service.test.ts`
- Modify: `src/modules/handoff/handoff.service.ts`
- Modify: `src/modules/handoff/handoff.service.test.ts`

- [ ] **Step 1: Write the failing orchestration tests**

Cover:

- `mode=knowledge` + `needKnowledge=true` calls the knowledge provider
- `mode=task` + `needTaskResolution=true` calls the task provider
- `mode=chat` bypasses tools
- `mode=clarify` bypasses tools and carries `clarifyQuestion`
- knowledge/task misses return guidance metadata instead of legacy handoff-only outputs

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test -- --run src/modules/router/request-router.test.ts src/modules/assistant/assistant.service.test.ts src/modules/handoff/handoff.service.test.ts`
Expected: FAIL because the current router still branches on the old intent enum and the service still expects a single query string.

- [ ] **Step 3: Write the minimal orchestration refactor**

Reshape the router input/output to something like:

```ts
type AssistantExecutionResult =
  | { mode: "knowledge"; knowledge: KnowledgeSearchResult }
  | { mode: "task"; task: TaskResolveResult }
  | { mode: "chat" }
  | { mode: "clarify"; clarifyQuestion: string };
```

Keep `handoff.service.ts` only if it still provides a narrow, reusable “should we recommend a human next?” helper. If not, delete it from the runtime path.

- [ ] **Step 4: Re-run the orchestration tests and confirm they pass**

Run: `npm test -- --run src/modules/router/request-router.test.ts src/modules/assistant/assistant.service.test.ts src/modules/handoff/handoff.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit the tool orchestration refactor**

```bash
git add src/modules/router/request-router.ts src/modules/router/request-router.test.ts src/modules/assistant/assistant.types.ts src/modules/assistant/assistant.service.ts src/modules/assistant/assistant.service.test.ts src/modules/handoff/handoff.service.ts src/modules/handoff/handoff.service.test.ts
git commit -m "refactor: route assistant flows from decision results"
```

---

### Task 7: Add a response generation layer grounded in tool facts

**Files:**
- Create: `src/modules/assistant/response-generator.ts`
- Create: `src/modules/assistant/response-generator.test.ts`
- Modify: `src/modules/assistant/reply-builder.ts`
- Modify: `src/modules/assistant/reply-builder.test.ts`
- Modify: `src/modules/assistant/assistant.service.ts`
- Modify: `src/modules/assistant/create-assistant-runtime.ts`

- [ ] **Step 1: Write the failing response-generation tests**

Cover:

- `chat` mode returns a natural model reply
- `clarify` mode uses the model-provided clarify question
- `knowledge` mode includes tool-grounded facts and source attribution
- `task` mode includes the real entry/action metadata
- generation failure falls back to a minimal local text formatter

Example:

```ts
expect(reply).toContain("依据《年假规则》");
expect(reply).toContain("https://oa.example.com/tasks/leave-application");
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test -- --run src/modules/assistant/response-generator.test.ts src/modules/assistant/reply-builder.test.ts src/modules/assistant/assistant.service.test.ts`
Expected: FAIL because there is no model-backed response generation layer yet.

- [ ] **Step 3: Implement the smallest useful response generator**

Add a new module that:

- accepts current message, recent context, `AssistantDecision`, and tool results
- builds a prompt with hard boundaries around tool facts
- asks the model for a final user-facing reply
- falls back to `reply-builder.ts` only when generation fails

Keep the grounding rules explicit in code:

```ts
// Facts from providers are authoritative; do not invent links or policies.
```

- [ ] **Step 4: Re-run the response tests and confirm they pass**

Run: `npm test -- --run src/modules/assistant/response-generator.test.ts src/modules/assistant/reply-builder.test.ts src/modules/assistant/assistant.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit the response-generation layer**

```bash
git add src/modules/assistant/response-generator.ts src/modules/assistant/response-generator.test.ts src/modules/assistant/reply-builder.ts src/modules/assistant/reply-builder.test.ts src/modules/assistant/assistant.service.ts src/modules/assistant/create-assistant-runtime.ts
git commit -m "feat: generate contextual assistant replies from tool facts"
```

---

### Task 8: Pass session identity through the channel and runtime entry points

**Files:**
- Modify: `src/modules/dingtalk/stream-handler.ts`
- Modify: `src/modules/dingtalk/stream-handler.test.ts`
- Modify: `src/modules/dingtalk/stream-client.ts`
- Modify: `src/modules/dingtalk/stream-client.test.ts`
- Modify: `src/app/api/dingtalk/webhook/route.ts`
- Modify: `src/app/api/dingtalk/webhook/route.test.ts`
- Modify: `docs/dingtalk-stream-setup.md`

- [ ] **Step 1: Write the failing integration tests**

Cover:

- stream messages pass a stable `sessionId` into the assistant
- webhook debug calls can supply a test session id
- the assistant reply path keeps working for knowledge/task/chat flows

Example:

```ts
expect(assistant.reply).toHaveBeenCalledWith({
  message: "那请假怎么申请",
  sessionId: "session-123"
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test -- --run src/modules/dingtalk/stream-handler.test.ts src/modules/dingtalk/stream-client.test.ts src/app/api/dingtalk/webhook/route.test.ts`
Expected: FAIL because the current channel contracts still pass a plain string query.

- [ ] **Step 3: Thread the richer request shape through the entry points**

Use the best available session identity for each entry:

- stream: session-scoped webhook or other stable conversation identifier from the payload
- webhook: request payload field or a deterministic debug fallback

Document the new debugging shape in `docs/dingtalk-stream-setup.md`.

- [ ] **Step 4: Re-run the integration tests and confirm they pass**

Run: `npm test -- --run src/modules/dingtalk/stream-handler.test.ts src/modules/dingtalk/stream-client.test.ts src/app/api/dingtalk/webhook/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit the channel wiring**

```bash
git add src/modules/dingtalk/stream-handler.ts src/modules/dingtalk/stream-handler.test.ts src/modules/dingtalk/stream-client.ts src/modules/dingtalk/stream-client.test.ts src/app/api/dingtalk/webhook/route.ts src/app/api/dingtalk/webhook/route.test.ts docs/dingtalk-stream-setup.md
git commit -m "feat: wire session-aware contextual assistant entry points"
```

---

### Task 9: Run the final verification sweep

**Files:**
- Modify as needed: files touched by the earlier tasks only

- [ ] **Step 1: Run the focused assistant suite**

Run:

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

Expected: PASS

- [ ] **Step 2: Run one manual smoke scenario**

Run: `npm run stream:dev`
Expected: the stream client boots cleanly with the model-enabled runtime, and logs show decision + response generation calls for a manual test message.

- [ ] **Step 3: Update docs if the smoke test reveals gaps**

Only touch:

- `docs/dingtalk-stream-setup.md`
- `README.md`

if the implemented runtime shape or debug steps differ from the plan.

- [ ] **Step 4: Commit the verification cleanup**

```bash
git add docs/dingtalk-stream-setup.md README.md
git commit -m "docs: finalize contextual assistant runtime notes"
```

