# DingTalk Admin Assistant MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone DingTalk Admin Assistant MVP project with a clear Next.js skeleton, FAQ-based answering flow, DingTalk webhook entry, and a pluggable retrieval interface for future RAG integration.

**Architecture:** This project starts as a standalone Next.js + TypeScript application focused on DingTalk assistant integration via API Routes. The first implementation uses structured FAQ retrieval and handoff rules, while defining a retrieval abstraction so an external RAG API can be connected later without redesigning the assistant flow.

**Tech Stack:** Node.js, TypeScript, Next.js App Router, Prisma, PostgreSQL, dotenv, DingTalk AI Assistant callback integration

---

## 📑 Scope

This plan covers:

- standalone project scaffolding
- backend application skeleton
- DingTalk webhook entry
- FAQ retrieval flow
- reply building
- handoff rules
- retrieval abstraction for future external RAG API

This plan does not yet cover:

- production deployment
- admin CMS
- full DingTalk card rendering
- external RAG API integration implementation

---

## 🧱 Planned File Structure

| Path | Responsibility |
| --- | --- |
| `package.json` | project scripts and dependencies |
| `tsconfig.json` | TypeScript project config |
| `src/app/layout.tsx` | App Router layout |
| `src/app/page.tsx` | local project placeholder page |
| `src/config/env.ts` | environment parsing |
| `src/app/api/dingtalk/webhook/route.ts` | DingTalk callback entry |
| `src/modules/assistant/assistant.service.ts` | assistant orchestration |
| `src/modules/assistant/reply-builder.ts` | final reply formatting |
| `src/modules/knowledge/retriever.types.ts` | retrieval interface |
| `src/modules/knowledge/faq-retriever.ts` | FAQ retrieval implementation |
| `src/modules/handoff/handoff.service.ts` | handoff rule evaluation |
| `src/modules/knowledge/faq.repository.ts` | FAQ data access |
| `prisma/schema.prisma` | FAQ and config data model |
| `src/modules/assistant/*.test.ts` | core flow tests |

---

### Task 1: Scaffold the standalone project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`

- [ ] **Step 1: Write the failing bootstrap test**

Create a simple smoke test for app creation.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL because project files and test runner are not ready.

- [ ] **Step 3: Add minimal project configuration**

Add scripts for:

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "test": "vitest run"
}
```

- [ ] **Step 4: Add minimal Next.js app shell**

```ts
export default function Home() {
  return <main>DingTalk Admin Assistant</main>;
}
```

- [ ] **Step 5: Run tests again**

Run: `npm test`
Expected: bootstrap test passes or moves to the next missing module.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json .gitignore src/app/layout.tsx src/app/page.tsx
git commit -m "chore: scaffold admin assistant app"
```

---

### Task 2: Define environment and configuration boundaries

**Files:**
- Create: `src/config/env.ts`
- Create: `.env.example`
- Test: `src/config/env.test.ts`

- [ ] **Step 1: Write failing config tests**

Test required environment variables:

- server port
- DingTalk app identifiers
- database URL
- optional external RAG endpoint

- [ ] **Step 2: Run target test**

Run: `npm test -- src/config/env.test.ts`
Expected: FAIL because config parser does not exist.

- [ ] **Step 3: Implement typed config parsing**

```ts
export type AppEnv = {
  port: number;
  databaseUrl: string;
  dingtalkClientId: string;
  dingtalkClientSecret: string;
  ragApiUrl?: string;
};
```

- [ ] **Step 4: Add `.env.example`**

Include placeholders for DingTalk and optional RAG settings.

- [ ] **Step 5: Re-run config tests**

Run: `npm test -- src/config/env.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/config/env.ts src/config/env.test.ts .env.example
git commit -m "chore: add environment configuration"
```

---

### Task 3: Model FAQ knowledge storage

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/modules/knowledge/faq.repository.ts`
- Test: `src/modules/knowledge/faq.repository.test.ts`

- [ ] **Step 1: Write failing repository tests**

Cover:

- creating FAQ records
- querying by category
- querying by aliases

- [ ] **Step 2: Run repository test**

Run: `npm test -- src/modules/knowledge/faq.repository.test.ts`
Expected: FAIL because repository and schema do not exist.

- [ ] **Step 3: Define minimal FAQ schema**

Include fields for:

- question
- aliases
- answer
- scope
- steps
- exceptions
- handoffCondition
- owner
- updatedAt

- [ ] **Step 4: Implement repository methods**

Examples:

```ts
findByExactQuestion(query: string)
findByAlias(query: string)
listQuickQuestions()
```

- [ ] **Step 5: Re-run repository tests**

Run: `npm test -- src/modules/knowledge/faq.repository.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma src/modules/knowledge/faq.repository.ts src/modules/knowledge/faq.repository.test.ts
git commit -m "feat: add faq repository"
```

---

### Task 4: Introduce pluggable retrieval abstraction

**Files:**
- Create: `src/modules/knowledge/retriever.types.ts`
- Create: `src/modules/knowledge/faq-retriever.ts`
- Test: `src/modules/knowledge/faq-retriever.test.ts`

- [ ] **Step 1: Write failing retriever tests**

Cover:

- successful FAQ hit
- alias hit
- no result

- [ ] **Step 2: Run retriever tests**

Run: `npm test -- src/modules/knowledge/faq-retriever.test.ts`
Expected: FAIL

- [ ] **Step 3: Define retriever interface**

```ts
export interface KnowledgeRetriever {
  search(query: string): Promise<KnowledgeHit[]>;
}
```

- [ ] **Step 4: Implement FAQ retriever**

The implementation should map repository results into normalized `KnowledgeHit[]`.

- [ ] **Step 5: Re-run retriever tests**

Run: `npm test -- src/modules/knowledge/faq-retriever.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/knowledge/retriever.types.ts src/modules/knowledge/faq-retriever.ts src/modules/knowledge/faq-retriever.test.ts
git commit -m "feat: add pluggable faq retriever"
```

---

### Task 5: Implement handoff rules and reply builder

**Files:**
- Create: `src/modules/handoff/handoff.service.ts`
- Create: `src/modules/assistant/reply-builder.ts`
- Test: `src/modules/handoff/handoff.service.test.ts`
- Test: `src/modules/assistant/reply-builder.test.ts`

- [ ] **Step 1: Write failing tests for handoff and reply formatting**

Cover:

- clear FAQ answer
- FAQ answer with handoff note
- no-hit fallback

- [ ] **Step 2: Run these tests**

Run: `npm test -- src/modules/handoff/handoff.service.test.ts src/modules/assistant/reply-builder.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement handoff evaluation**

Rules should support:

- low confidence
- missing scope
- explicit sensitive category

- [ ] **Step 4: Implement reply builder**

Build output with sections:

- summary
- scope
- steps
- exceptions
- handoff

- [ ] **Step 5: Re-run tests**

Run: `npm test -- src/modules/handoff/handoff.service.test.ts src/modules/assistant/reply-builder.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/handoff/handoff.service.ts src/modules/assistant/reply-builder.ts src/modules/handoff/handoff.service.test.ts src/modules/assistant/reply-builder.test.ts
git commit -m "feat: add handoff rules and reply builder"
```

---

### Task 6: Implement assistant orchestration service

**Files:**
- Create: `src/modules/assistant/assistant.service.ts`
- Test: `src/modules/assistant/assistant.service.test.ts`

- [ ] **Step 1: Write failing orchestration tests**

Cover:

- FAQ hit flow
- no-hit fallback flow
- future provider compatibility via retriever injection

- [ ] **Step 2: Run orchestration tests**

Run: `npm test -- src/modules/assistant/assistant.service.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement assistant service**

The service should:

- accept user query
- call `KnowledgeRetriever`
- evaluate handoff
- build reply

- [ ] **Step 4: Re-run orchestration tests**

Run: `npm test -- src/modules/assistant/assistant.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/assistant/assistant.service.ts src/modules/assistant/assistant.service.test.ts
git commit -m "feat: add assistant orchestration service"
```

---

### Task 7: Add DingTalk webhook entry

**Files:**
- Create: `src/app/api/dingtalk/webhook/route.ts`
- Test: `src/app/api/dingtalk/webhook/route.test.ts`

- [ ] **Step 1: Write failing webhook tests**

Cover:

- valid request handled
- invalid payload rejected
- assistant reply returned

- [ ] **Step 2: Run webhook tests**

Run: `npm test -- src/modules/dingtalk/webhook.controller.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement controller and route registration**

The route should:

- parse DingTalk callback body
- extract user message
- call assistant service
- return reply payload

- [ ] **Step 4: Re-run webhook tests**

Run: `npm test -- src/modules/dingtalk/webhook.controller.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/dingtalk/webhook/route.ts src/app/api/dingtalk/webhook/route.test.ts
git commit -m "feat: add dingtalk webhook entry"
```

---

### Task 8: Add sample FAQ seed and quick questions

**Files:**
- Create: `prisma/seed.ts`
- Create: `docs/sample-faq.md`
- Test: `src/modules/knowledge/faq.repository.test.ts`

- [ ] **Step 1: Add sample admin FAQ entries**

Include:

- 请假怎么申请
- 补卡流程是什么
- 会议室怎么预订
- 电脑坏了找谁

- [ ] **Step 2: Add quick question data contract**

Expose a method for assistant homepage suggestions.

- [ ] **Step 3: Verify repository tests still pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts docs/sample-faq.md
git commit -m "feat: add sample admin faq data"
```

---

### Task 9: Document local run flow

**Files:**
- Modify: `README.md`
- Create: `docs/local-dev.md`

- [ ] **Step 1: Document install and run commands**

Include:

```bash
npm install
npm run dev
```

- [ ] **Step 2: Document required environment variables**

- [ ] **Step 3: Document DingTalk webhook local debug approach**

- [ ] **Step 4: Commit**

```bash
git add README.md docs/local-dev.md
git commit -m "docs: add local development guide"
```

---

## ✅ Definition of Done

The MVP foundation is considered ready when:

- the standalone project runs locally
- DingTalk webhook route exists
- FAQ retrieval works
- reply builder works
- handoff logic works
- external RAG integration point is abstracted but optional
