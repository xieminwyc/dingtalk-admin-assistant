import type { KnowledgeCard } from "./knowledge-card.types";
import type {
  KnowledgeHit,
  KnowledgeRetriever,
  KnowledgeSearchOptions
} from "./retriever.types";

function normalizeText(text: string) {
  return text.trim().replace(/\s+/g, "").toLowerCase();
}

function includesNormalizedText(source: string, query: string) {
  return normalizeText(source).includes(normalizeText(query));
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
        // 关键词允许“会议室怎么预订”这类包含式命中，先满足一期可控召回。
        (keyword) =>
          includesNormalizedText(keyword, query) ||
          includesNormalizedText(query, keyword)
      );
    });

    return matches.map((card) => {
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
  }
}
