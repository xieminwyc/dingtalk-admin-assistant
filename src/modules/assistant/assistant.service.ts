import type { IntentAnalyzer } from "../intents/intent-analyzer";
import type { IntentAnalysis } from "../intents/intent-analyzer";
import type { KnowledgeRetriever } from "../knowledge/retriever.types";
import { buildAssistantReply } from "./reply-builder";
import {
  buildClarificationResolution,
  createRequestRouter,
  type TaskCatalogResolver
} from "../router/request-router";

export function createAssistantService(input: {
  localRetriever: KnowledgeRetriever;
  // service 只依赖最小解析接口，避免把编排层绑死在具体目录实现上。
  taskCatalog: TaskCatalogResolver;
  externalRetriever?: KnowledgeRetriever;
  enableExternalKnowledge?: boolean;
  analyzer?: IntentAnalyzer;
}) {
  const router = createRequestRouter({
    localRetriever: input.localRetriever,
    taskCatalog: input.taskCatalog,
    externalRetriever: input.externalRetriever,
    enableExternalKnowledge: input.enableExternalKnowledge
  });

  return {
    async reply(query: string) {
      let intent: IntentAnalysis | null = null;

      if (input.analyzer) {
        try {
          intent = await input.analyzer.analyze(query);
        } catch {
          // analyzer 失效时先保守降级，避免把异常暴露给用户。
          return buildAssistantReply(buildClarificationResolution());
        }
      }

      // 未接分析器时，默认按知识问答路径走，兼容现有单一路径调用方。
      const resolvedIntent =
        intent ??
        ({
          intent: "knowledge_query",
          source: "none"
        } satisfies IntentAnalysis);
      const resolution = await router.route({
        query,
        intent: resolvedIntent
      });

      return buildAssistantReply(resolution);
    }
  };
}
