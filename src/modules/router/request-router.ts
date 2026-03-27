import type { AssistantResolution } from "../assistant/assistant.types";
import { evaluateHandoff } from "../handoff/handoff.service";
import type { IntentAnalysis } from "../intents/intent-analyzer";
import type { KnowledgeHit, KnowledgeRetriever } from "../knowledge/retriever.types";
import type {
  TaskCatalogResolution,
  TaskCatalogResolveInput
} from "../tasks/task-catalog.types";

export const DEFAULT_CLARIFICATION_PROMPT =
  "我可以帮你查制度说明，或告诉你办理入口。请再具体描述一下问题。";
const EXTERNAL_RELIABLE_SCORE = 0.6;

export interface TaskCatalogResolver {
  resolve(input: TaskCatalogResolveInput): TaskCatalogResolution;
}

export type RequestRouteInput = {
  query: string;
  intent: IntentAnalysis;
  // 给后续任务来源保留轻量扩展位：如果上游已经拿到结构化 taskType，就直接透传。
  taskType?: string;
};

export function buildClarificationResolution(reason?: string): AssistantResolution {
  return {
    kind: "clarification",
    intent: "unknown",
    prompt: DEFAULT_CLARIFICATION_PROMPT,
    reason
  };
}

function buildKnowledgeResolution(hit: KnowledgeHit): AssistantResolution {
  return {
    kind: "knowledge",
    intent: "knowledge_query",
    title: hit.title ?? hit.question,
    answer: hit.answer,
    scope: hit.scope
  };
}

function buildTaskResolution(
  taskCatalog: TaskCatalogResolver,
  input: { query: string; taskType?: string }
): AssistantResolution {
  // router 只约束“能 resolve 即可”，这样 service、测试和未来其他任务源都不必耦合具体类。
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
    guidance: [task.description, preparations].filter(Boolean).join("\n")
  };
}

async function searchKnowledge(input: {
  query: string;
  localRetriever: KnowledgeRetriever;
  externalRetriever?: KnowledgeRetriever;
  enableExternalKnowledge?: boolean;
}) {
  // 只有显式开启外部 provider 时才会尝试，避免把知识路由变成隐式联网依赖。
  if (input.enableExternalKnowledge && input.externalRetriever) {
    try {
      const externalHits = await input.externalRetriever.search(input.query);
      const topExternalHit = externalHits[0];

      if (topExternalHit && topExternalHit.score >= EXTERNAL_RELIABLE_SCORE) {
        return externalHits;
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
      switch (request.intent.intent) {
        case "knowledge_query": {
          const hits = await searchKnowledge({
            query: request.query,
            localRetriever: input.localRetriever,
            externalRetriever: input.externalRetriever,
            enableExternalKnowledge: input.enableExternalKnowledge
          });
          const handoff = evaluateHandoff({
            hitCount: hits.length,
            topScore: hits[0]?.score ?? 0
          });

          if (handoff.required || !hits[0]) {
            return buildClarificationResolution(handoff.reason);
          }

          return buildKnowledgeResolution(hits[0]);
        }
        case "task_request":
          return buildTaskResolution(input.taskCatalog, request);
        case "handoff_request":
          return {
            kind: "handoff",
            intent: "handoff_request",
            reason: "这类需求更适合行政同学直接处理，请联系行政同学。"
          };
        case "smalltalk":
          return {
            kind: "smalltalk",
            intent: "smalltalk",
            reply: "你好，我可以帮你查行政制度或办理入口。"
          };
        case "unknown":
          return buildClarificationResolution();
      }
    }
  };
}
