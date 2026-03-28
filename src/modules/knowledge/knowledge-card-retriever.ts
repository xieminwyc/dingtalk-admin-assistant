import type { KnowledgeCard } from "./knowledge-card.types";
import type {
  KnowledgeRetriever,
  KnowledgeSearchOptions,
  KnowledgeSearchResult
} from "./retriever.types";

const SUGGESTION_STOP_WORDS = /(是什么|什么意思|怎么办|怎么|如何|规则|制度|政策|规范|说明)/g;

function normalizeText(text: string) {
  return text.trim().replace(/\s+/g, "").toLowerCase();
}

function normalizeSuggestionQuery(query: string) {
  return normalizeText(query).replace(SUGGESTION_STOP_WORDS, "");
}

function scoreSuggestion(query: string, candidate: string) {
  if (!query || !candidate) {
    return 0;
  }

  if (candidate.includes(query) || query.includes(candidate)) {
    return query.length + candidate.length;
  }

  const sharedCharacters = [...new Set(candidate)].filter((character) =>
    query.includes(character)
  );

  return sharedCharacters.length;
}

function buildRelatedKeywords(
  query: string,
  cards: KnowledgeCard[],
  options?: KnowledgeSearchOptions
) {
  const normalizedQuery = normalizeSuggestionQuery(query);

  if (!normalizedQuery) {
    return [];
  }

  // 这里故意只做轻量建议，不试图“猜答案”。
  // 我们只挑标题和关键词里与用户表达有明显字符重叠的候选，供后续回复层追问。
  const candidates = cards
    .filter((card) => {
      if (options?.department && card.department !== options.department) {
        return false;
      }

      return true;
    })
    .flatMap((card) => [card.title, ...card.keywords])
    .map((candidate) => ({
      value: candidate,
      score: scoreSuggestion(normalizedQuery, normalizeText(candidate))
    }))
    .filter((candidate) => candidate.score >= 2)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return right.value.length - left.value.length;
    });

  return [...new Set(candidates.map((candidate) => candidate.value))].slice(0, 3);
}

export class KnowledgeCardRetriever implements KnowledgeRetriever {
  constructor(private readonly cards: KnowledgeCard[]) {}

  async search(
    query: string,
    options?: KnowledgeSearchOptions
  ): Promise<KnowledgeSearchResult> {
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

    const hits = matches
      .map((card) => {
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
          source: "seed" as const,
          referenceLabel: card.title
        };
      })
      // assistant 目前会优先读取 hits[0]，这里先把高置信结果排到最前面。
      .sort((left, right) => right.score - left.score);

    return {
      hits,
      relatedKeywords: hits.length > 0 ? [] : buildRelatedKeywords(query, this.cards, options)
    };
  }
}
