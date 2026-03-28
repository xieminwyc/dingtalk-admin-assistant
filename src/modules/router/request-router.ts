import type { AssistantResolution } from "../assistant/assistant.types";
import { evaluateHandoff } from "../handoff/handoff.service";
import type { IntentAnalysis } from "../intents/intent-analyzer";
import type {
  KnowledgeHit,
  KnowledgeRetriever,
  KnowledgeSearchResult
} from "../knowledge/retriever.types";
import type {
  TaskCatalogResolution,
  TaskCatalogResolveInput
} from "../tasks/task-catalog.types";

export const DEFAULT_CLARIFICATION_PROMPT =
  "我可以帮你查制度说明，或告诉你办理入口。请再具体描述一下问题。";
const EXTERNAL_RELIABLE_SCORE = 0.6;

// router 只依赖“能把任务请求解析成目录结果”的最小能力，
// 这样后面无论任务来源是本地种子、数据库还是外部服务，都能直接替换。
export interface TaskCatalogResolver {
  resolve(input: TaskCatalogResolveInput): TaskCatalogResolution;
}

export type RequestRouteInput = {
  query: string;
  intent: IntentAnalysis;
  // 给后续任务来源保留轻量扩展位：如果上游已经拿到结构化 taskType，就直接透传。
  taskType?: string;
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
    relatedKeywords: input?.relatedKeywords
  };
}

function buildKnowledgeResolution(hit: KnowledgeHit): AssistantResolution {
  return {
    kind: "knowledge",
    intent: "knowledge_query",
    title: hit.title ?? hit.question,
    answer: hit.answer,
    scope: hit.scope,
    referenceLabel: hit.referenceLabel
  };
}

// 事务路由只负责把目录结果翻译成 assistant 可消费的统一结构，
// 不在这里决定“这个请求是不是事务”，那是 intent analyzer 的职责。
function buildTaskResolution(
  taskCatalog: TaskCatalogResolver,
  input: { query: string; taskType?: string }
): AssistantResolution {
  const task = taskCatalog.resolve({
    query: input.query,
    taskType: input.taskType
  });
  const preparations =
    task.preparations.length > 0 ? `办理前准备：${task.preparations.join("、")}` : undefined;

  return {
    kind: "task",
    intent: "task_request",
    title: task.title,
    entry:
      task.entryUrl ??
      `暂未找到可直接跳转的入口，请联系${task.fallbackContact}确认办理方式。`,
    guidance: [task.description, preparations].filter(Boolean).join("\n"),
    actionType: task.actionType,
    availability: task.availability,
    availabilityReason: task.availabilityReason
  };
}

// 知识检索采用“外部优先，本地兜底”的一期策略：
// 只有显式启用外部 provider 时才尝试外部结果，且必须达到可靠分数，
// 否则一律回退到本地知识卡片，保证机器人先稳定可用。
async function searchKnowledge(input: {
  query: string;
  localRetriever: KnowledgeRetriever;
  externalRetriever?: KnowledgeRetriever;
  enableExternalKnowledge?: boolean;
}): Promise<KnowledgeSearchResult> {
  if (input.enableExternalKnowledge && input.externalRetriever) {
    try {
      const externalResult = await input.externalRetriever.search(input.query);
      const topExternalHit = externalResult.hits[0];

      if (topExternalHit && topExternalHit.score >= EXTERNAL_RELIABLE_SCORE) {
        return externalResult;
      }
    } catch {
      // provider 出错时直接回退本地卡片，保证一期能力稳定。
    }
  }

  return input.localRetriever.search(input.query);
}

export function createRequestRouter(input: {
  localRetriever: KnowledgeRetriever;
  taskCatalog: TaskCatalogResolver;
  externalRetriever?: KnowledgeRetriever;
  enableExternalKnowledge?: boolean;
}) {
  return {
    async route(request: RequestRouteInput): Promise<AssistantResolution> {
      switch (request.intent.mode) {
        case "knowledge": {
          const knowledgeResult = await searchKnowledge({
            query: request.intent.knowledgeHint ?? request.query,
            localRetriever: input.localRetriever,
            externalRetriever: input.externalRetriever,
            enableExternalKnowledge: input.enableExternalKnowledge
          });
          const hits = knowledgeResult.hits;
          const handoff = evaluateHandoff({
            hitCount: hits.length,
            topScore: hits[0]?.score ?? 0
          });

          if (handoff.required || !hits[0]) {
            // 这里显式区分“完全没候选”和“有候选但不够可靠”，
            // 方便回复层决定是优先给相近建议，还是提醒用户当前答案不够稳。
            const reasonCode = !hits[0] ? "no_candidate" : "low_confidence";
            return buildClarificationResolution({
              reason: handoff.reason,
              reasonCode,
              relatedKeywords: knowledgeResult.relatedKeywords
            });
          }

          return buildKnowledgeResolution(hits[0]);
        }
        case "task":
          // 任务请求允许上游透传结构化 taskType；没有时就退回 query 关键词解析。
          return buildTaskResolution(input.taskCatalog, request);
        case "chat":
          return {
            kind: "smalltalk",
            intent: "smalltalk",
            reply: "你好，我可以帮你查行政制度或办理入口。"
          };
        case "clarify":
          return buildClarificationResolution({
            prompt: request.intent.clarifyQuestion
          });
      }
    }
  };
}
