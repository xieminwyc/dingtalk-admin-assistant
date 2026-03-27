import type { KnowledgeCard } from "./knowledge-card.types";
import type {
  KnowledgeHit,
  KnowledgeRetriever,
  KnowledgeSearchOptions
} from "./retriever.types";

function normalizeText(text: string) {
  return text.trim().replace(/\s+/g, "").toLowerCase();
}

export class KnowledgeCardRetriever implements KnowledgeRetriever {
  constructor(private readonly cards: KnowledgeCard[]) {}

  async search(
    query: string,
    options?: KnowledgeSearchOptions
  ): Promise<KnowledgeHit[]> {
    const normalizedQuery = normalizeText(query);

    const matches = this.cards.filter((card) => {
      if (options?.department && card.department !== options.department) {
        return false;
      }

      if (normalizeText(card.title) === normalizedQuery) {
        return true;
      }

      return card.keywords.some(
        // 一期知识卡片只接受标题/关键词精确命中，避免把模糊问法误判成稳定答案。
        (keyword) => normalizeText(keyword) === normalizedQuery
      );
    });

    const hits = matches.map((card) => {
      const titleMatched = normalizeText(card.title) === normalizedQuery;

      return {
        id: card.id,
        title: card.title,
        question: card.title,
        answer: card.content,
        content: card.content,
        scope: card.scope ?? card.department,
        department: card.department,
        score: titleMatched ? 0.97 : 0.91,
        source: "knowledge_card"
      };
    });

    // assistant 目前会优先读取 hits[0]，这里先把高置信结果排到最前面。
    return hits.sort((left, right) => right.score - left.score);
  }
}
