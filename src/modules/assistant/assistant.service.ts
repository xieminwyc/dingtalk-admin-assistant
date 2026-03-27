import type { IntentAnalyzer } from "../intents/intent-analyzer";
import { evaluateHandoff } from "../handoff/handoff.service";
import type { IntentAnalysis } from "../intents/intent-analyzer";
import type { KnowledgeRetriever } from "../knowledge/retriever.types";
import { buildAssistantReply } from "./reply-builder";

function buildConservativeClarificationReply() {
  return buildAssistantReply({
    kind: "clarification",
    intent: "unknown",
    prompt: "我可以帮你查制度说明，或告诉你办理入口。请再具体描述一下问题。"
  });
}

function buildReplyFromIntent(intent: IntentAnalysis) {
  if (intent.intent === "smalltalk") {
    return buildAssistantReply({
      kind: "smalltalk",
      intent: "smalltalk",
      reply: "你好，我可以帮你查行政制度或办理入口。"
    });
  }

  if (intent.intent === "handoff_request") {
    return buildAssistantReply({
      kind: "handoff",
      intent: "handoff_request",
      reason: "这类需求更适合行政同学直接处理，请联系行政同学。"
    });
  }

  if (intent.intent === "task_request") {
    return buildAssistantReply({
      kind: "task",
      intent: "task_request",
      title: "事务办理",
      entry: "当前正在接入具体办理入口，请先联系行政同学协助处理。",
      guidance: "如需制度说明，也可以补充具体问题继续提问。"
    });
  }

  if (intent.intent === "unknown") {
    return buildConservativeClarificationReply();
  }

  return null;
}

export function createAssistantService(input: {
  retriever: KnowledgeRetriever;
  analyzer?: IntentAnalyzer;
}) {
  return {
    async reply(query: string) {
      let intent: IntentAnalysis | null = null;

      if (input.analyzer) {
        try {
          intent = await input.analyzer.analyze(query);
        } catch {
          // analyzer 失效时先保守降级，避免把异常暴露给用户。
          return buildConservativeClarificationReply();
        }
      }

      if (intent) {
        const intentReply = buildReplyFromIntent(intent);

        if (intentReply) {
          return intentReply;
        }
      }

      // assistant service 只做流程编排：检索 -> 边界判断 -> 拼回复。
      const hits = await input.retriever.search(query);
      const handoff = evaluateHandoff({
        hitCount: hits.length,
        topScore: hits[0]?.score ?? 0
      });

      return buildAssistantReply({
        hit: hits[0],
        handoff
      });
    }
  };
}
