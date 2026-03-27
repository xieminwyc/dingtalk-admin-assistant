import { evaluateHandoff } from "../handoff/handoff.service";
import type { KnowledgeRetriever } from "../knowledge/retriever.types";
import { buildAssistantReply } from "./reply-builder";

export function createAssistantService(input: {
  retriever: KnowledgeRetriever;
}) {
  return {
    async reply(query: string) {
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
