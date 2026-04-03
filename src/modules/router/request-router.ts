import type { EntryMode } from "../assistant/entry-mode.types";
import type { AssistantResolution } from "../assistant/assistant.types";
import type { ContactDirectoryResolution } from "../contacts/contact-directory.types";
import { evaluateHandoff } from "../handoff/handoff.service";
import type { IntentAnalysis } from "../intents/intent-analyzer";
import type {
  KnowledgeHit,
  KnowledgeRetriever,
  KnowledgeSearchResult,
} from "../knowledge/retriever.types";
import type {
  TaskCatalogResolution,
  TaskCatalogResolveInput,
} from "../tasks/task-catalog.types";
import { tryBuildOaApprovalLink } from "../oa/oa-link";

export const DEFAULT_CLARIFICATION_PROMPT =
  "我可以帮你查制度说明，或告诉你办理入口。请再具体描述一下问题。";
const RELIABLE_KNOWLEDGE_SCORE = 0.6;

// router 只依赖“能把任务请求解析成目录结果”的最小能力，
// 这样后面无论任务来源是本地种子、数据库还是外部服务，都能直接替换。
export interface TaskCatalogResolver {
  resolve(input: TaskCatalogResolveInput): TaskCatalogResolution;
}

export interface ContactDirectoryResolver {
  resolve(input: { query: string }): ContactDirectoryResolution | null;
}

export type RequestRouteInput = {
  query: string;
  intent: IntentAnalysis;
  entryMode?: EntryMode;
  // 给后续任务来源保留轻量扩展位：如果上游已经拿到结构化 taskType，就直接透传。
  taskType?: string;
  userId?: string;
  sessionId?: string;
};

// 澄清回复在路由层统一生成，assistant service 只复用这里的结果，
// 避免同一条保守文案在多处维护后产生漂移。
export function buildClarificationResolution(input?: {
  prompt?: string;
  reason?: string;
  reasonCode?: "no_candidate" | "low_confidence" | "need_disambiguation";
  relatedKeywords?: string[];
}): AssistantResolution {
  return {
    kind: "clarification",
    intent: "unknown",
    prompt: input?.prompt ?? DEFAULT_CLARIFICATION_PROMPT,
    reason: input?.reason,
    reasonCode: input?.reasonCode,
    relatedKeywords: input?.relatedKeywords,
  };
}

function buildKnowledgeResolution(hit: KnowledgeHit): AssistantResolution {
  return {
    kind: "knowledge",
    intent: "knowledge_query",
    title: hit.title ?? hit.question,
    answer: hit.answer,
    scope: hit.scope,
    referenceLabel: hit.referenceLabel,
    sourceUrl: hit.url,
    source: hit.source,
  };
}

function buildContactResolution(
  resolution: ContactDirectoryResolution,
): AssistantResolution {
  return {
    kind: "contact",
    intent: "handoff_request",
    title: resolution.title,
    contactName: resolution.contactName,
    team: resolution.team,
    description: resolution.description,
    actionHint: resolution.actionHint,
  };
}

// 事务路由只负责把目录结果翻译成 assistant 可消费的统一结构，
// 不在这里决定“这个请求是不是事务”，那是 intent analyzer 的职责。
function buildTaskResolution(
  taskCatalog: TaskCatalogResolver,
  input: { query: string; taskType?: string; corpId?: string },
): AssistantResolution {
  const task = taskCatalog.resolve({
    query: input.query,
    taskType: input.taskType,
  });
  const preparations =
    task.preparations.length > 0
      ? `办理前准备：${task.preparations.join("、")}`
      : undefined;

  // processCode 存在时生成钉钉审批网页链接，用户点击即可直接打开审批表单。
  const oaLink = tryBuildOaApprovalLink({
    processCode: task.processCode,
    corpId: input.corpId,
  });

  const entry =
    oaLink ??
    task.entryUrl ??
    `暂未找到可直接跳转的入口，请联系${task.fallbackContact}确认办理方式。`;

  return {
    kind: "task",
    intent: "task_request",
    title: task.title,
    entry,
    guidance: [task.description, preparations].filter(Boolean).join("\n"),
    actionType: task.actionType,
    availability: task.availability,
    availabilityReason: task.availabilityReason,
  };
}

function hasReliableKnowledgeHit(result: KnowledgeSearchResult): boolean {
  return (result.hits[0]?.score ?? 0) >= RELIABLE_KNOWLEDGE_SCORE;
}

function searchRetriever(
  retriever: KnowledgeRetriever,
  input: {
    query: string;
    userId?: string;
    sessionId?: string;
  },
): Promise<KnowledgeSearchResult> {
  if (!input.userId && !input.sessionId) {
    return retriever.search(input.query);
  }

  return retriever.search(input.query, {
    userId: input.userId,
    sessionId: input.sessionId,
  });
}

// 启用外部知识库时，优先使用外部 RAG。
// 但外部超时、空结果或低置信度都应该回退到本地知识，避免把“服务异常”伪装成“没内容”。
async function searchKnowledge(input: {
  query: string;
  localRetriever: KnowledgeRetriever;
  externalRetriever?: KnowledgeRetriever;
  enableExternalKnowledge?: boolean;
  userId?: string;
  sessionId?: string;
}): Promise<KnowledgeSearchResult> {
  if (input.enableExternalKnowledge && input.externalRetriever) {
    try {
      const externalResult = await searchRetriever(input.externalRetriever, {
        query: input.query,
        userId: input.userId,
        sessionId: input.sessionId,
      });

      if (hasReliableKnowledgeHit(externalResult)) {
        return externalResult;
      }
    } catch (error) {
      console.error("[searchKnowledge] external RAG error:", error);
    }
  }

  return searchRetriever(input.localRetriever, {
    query: input.query,
    userId: input.userId,
    sessionId: input.sessionId,
  });
}

export function createRequestRouter(input: {
  localRetriever: KnowledgeRetriever;
  taskCatalog: TaskCatalogResolver;
  contactDirectory?: ContactDirectoryResolver;
  externalRetriever?: KnowledgeRetriever;
  enableExternalKnowledge?: boolean;
  // corpId 用于生成钉钉审批直达链接，来自 env.dingtalkCorpId。
  corpId?: string;
}) {
  return {
    async route(request: RequestRouteInput): Promise<AssistantResolution> {
      if (request.entryMode === "image_placeholder") {
        return {
          kind: "open_response",
          intent: "smalltalk",
          reply:
            "发票识别能力即将支持。你可以先告诉我票据类型、需要提取的字段和使用场景，我可以先帮你整理 OCR 需求。",
        };
      }

      if (request.entryMode === "contact" && input.contactDirectory) {
        const contact = input.contactDirectory.resolve({
          query: request.query,
        });

        if (contact) {
          return buildContactResolution(contact);
        }
      }

      switch (request.intent.mode) {
        case "internal_knowledge": {
          const knowledgeResult = await searchKnowledge({
            query: request.intent.knowledgeHint ?? request.query,
            localRetriever: input.localRetriever,
            externalRetriever: input.externalRetriever,
            enableExternalKnowledge: input.enableExternalKnowledge,
            userId: request.userId,
            sessionId: request.sessionId,
          });
          const hits = knowledgeResult.hits;
          const handoff = evaluateHandoff({
            hitCount: hits.length,
            topScore: hits[0]?.score ?? 0,
          });

          if (!hits[0]) {
            return buildClarificationResolution({
              reason: handoff.reason,
              reasonCode: "no_candidate",
              relatedKeywords: knowledgeResult.relatedKeywords,
            });
          }

          if (handoff.required) {
            return buildClarificationResolution({
              reason: handoff.reason,
              reasonCode: "low_confidence",
              relatedKeywords: knowledgeResult.relatedKeywords,
            });
          }

          return buildKnowledgeResolution(hits[0]);
        }
        case "task":
          // 任务请求允许上游透传结构化 taskType；没有时就退回 query 关键词解析。
          return buildTaskResolution(input.taskCatalog, {
            query: request.query,
            taskType: request.taskType,
            corpId: input.corpId,
          });
        case "open_response":
          return {
            kind: "open_response",
            intent: "smalltalk",
            // open_response 代表“直接交给模型回答”，这里保留 query 作为兜底事实，
            // 方便 response generator 在无工具场景下继续自然作答。
            reply: request.query,
          };
        case "clarify":
          return buildClarificationResolution({
            prompt: request.intent.clarifyQuestion,
          });
      }
    },
  };
}
