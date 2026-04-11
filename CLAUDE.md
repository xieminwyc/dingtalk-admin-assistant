# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

钉钉行政助手 — A DingTalk (钉钉) chatbot for enterprise admin tasks. It runs as both:

- A **Next.js 16 web app** (H5 工作台 UI, deployed on Vercel)
- A **DingTalk Stream client** (long-lived process receiving bot messages via `dingtalk-stream` SDK)

## Commands

```bash
npm run dev          # Next.js dev server (web UI)
npm run stream:dev   # DingTalk Stream client with tsx watch (bot message handler)
npm run build        # Production build
npm run test         # Run all tests (vitest)
npx vitest run src/modules/intents/intent-analyzer.test.ts  # Run a single test file
npm run lint         # ESLint
npx tsc --noEmit     # Type check without emitting
```

The Stream client (`npm run stream:dev`) is a separate long-running process that connects to DingTalk via WebSocket — it is independent of `npm run dev`.

## Architecture

### Two Entry Points

1. **Web UI** — Next.js App Router at `src/app/`. Users open this in DingTalk's H5 workspace or a browser. Identity is resolved via OAuth2 redirect flow (see `docs/dingtalk-h5-identity.md`).
2. **Stream Bot** — `src/scripts/start-dingtalk-stream.ts`. Receives DingTalk bot messages via `dingtalk-stream` SDK, processes them through the assistant pipeline, replies via `sessionWebhook`.

Both entry points share the same assistant module.

### Module Structure (`src/modules/`)

The codebase uses **port-based dependency injection** — each module defines TypeScript type interfaces (ports) for its dependencies, which are injected at construction time. This makes every module independently testable with mock ports.

| Module       | Responsibility                                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| `assistant/` | Core orchestration: receives a query, runs intent analysis → routing → knowledge retrieval → response generation  |
| `intents/`   | Intent classification: heuristic-based (`company-knowledge-heuristics`) and LLM-based (`model-intent-classifier`) |
| `router/`    | Routes classified intents to the appropriate handler (knowledge, task, handoff, smalltalk)                        |
| `knowledge/` | Knowledge retrieval: FAQ, knowledge cards, local documents, external RAG API                                      |
| `tasks/`     | Task catalog (OA forms, common procedures)                                                                        |
| `contacts/`  | Employee contact directory                                                                                        |
| `handoff/`   | Human agent handoff                                                                                               |
| `oa/`        | DingTalk OA (审批) link generation                                                                                |
| `dingtalk/`  | DingTalk integration: Stream client, stream handler, browser identity, user service                               |
| `logging/`   | Conversation logging and context tracking                                                                         |

### Assistant Pipeline Flow

```
User query
  → IntentAnalyzer (heuristics + optional LLM classifier)
  → RequestRouter (dispatches by intent type)
  → KnowledgeRetriever / TaskCatalog / ContactDirectory / Handoff
  → ResponseGenerator (formats final reply)
  → Reply (via Stream webhook or web UI)
```

The pipeline is assembled in `create-assistant-runtime.ts` which wires all modules together from env config.

### Data

- **Prisma + SQLite** — schema at `prisma/schema.prisma`, generated client at `src/generated/prisma`
- Models: Department, KnowledgeCard, TaskCatalogItem, DingTalkUser, ConversationLog, KnowledgeProviderConfig
- Sample/seed data lives in `sample-*.ts` files within each module

### DingTalk Identity (H5 Browser)

OAuth2 redirect flow only — JSAPI `requestAuthCode` does NOT work (returns 40078). Full details in `docs/dingtalk-h5-identity.md`.

### Image Recognition

DingTalk richText images are ingested and processed via the vision model. Images take a fast-path: when `imageUrl` is present, the query skips intent analysis and goes directly to `ResponseGenerator`. See `docs/dingtalk-image-debugging.md` for troubleshooting.

## Testing

- **Framework**: Vitest with jsdom environment
- **Pattern**: Co-located test files (`*.test.ts` next to source)
- **Style**: All modules use port injection, so tests inject mock implementations directly — no global mocking required
- **Path alias**: `@/` maps to `src/` (configured in both `tsconfig.json` and `vitest.config.ts`)

## Environment Variables

Required: `DINGTALK_CLIENT_ID`, `DINGTALK_CLIENT_SECRET`

Optional: `DINGTALK_CORP_ID`, `DATABASE_URL`, `RAG_API_URL`, `RAG_API_KEY`, `SILICONFLOW_API_KEY`, `SILICONFLOW_BASE_URL`, `SILICONFLOW_MODEL`

Schema validated by zod in `src/config/env.ts`. Local dev uses `.env.local`.

**Vision model requirement**: If using image recognition, `SILICONFLOW_MODEL` must be a vision-capable model (e.g., `Qwen/Qwen3-VL-8B-Instruct`). Pure text models (e.g., `Qwen/Qwen2.5-7B-Instruct`) will fail on image queries.

**Vercel deployment**: Deployed at https://dingtalk-admin-assistant.vercel.app. Use `npx vercel env update` to change production env vars. Use `printf "value"` (not `echo`) to avoid trailing newlines when setting variables.

## Language

Code comments and user-facing strings are in Chinese (中文). Commit messages and technical docs are in English.
