import type { KnowledgeCard } from "./knowledge-card.types";
import type {
  KnowledgeRetriever,
  KnowledgeSearchOptions,
  KnowledgeSearchResult
} from "./retriever.types";

const MATCH_QUERY_STOP_WORDS = /(是什么|什么意思|怎么办|怎么|如何|怎么算|多少|吗|呢)/g;
const SUGGESTION_STOP_WORDS =
  /(是什么|什么意思|怎么办|怎么|如何|怎么算|多少|规则|制度|政策|规范|说明|流程|入口)/g;
const MIN_FUZZY_MATCH_SCORE = 0.7;

function normalizeText(text: string) {
  return text.trim().replace(/\s+/g, "").toLowerCase();
}

function normalizeSuggestionQuery(query: string) {
  return normalizeText(query).replace(SUGGESTION_STOP_WORDS, "");
}

function normalizeMatchQuery(query: string) {
  return normalizeText(query).replace(MATCH_QUERY_STOP_WORDS, "");
}

function scoreSuggestion(query: string, candidate: string) {
  if (!query || !candidate) {
    return 0;
  }

  if (candidate.includes(query) || query.includes(candidate)) {
    return query.length + candidate.length;
  }

  const sharedCharacters = [...new Set(candidate)].filter((character) => query.includes(character));

  return sharedCharacters.length;
}

function scoreKnowledgeCandidate(
  query: string,
  candidate: string,
  options?: { exactScore?: number; allowFuzzy?: boolean }
) {
  if (!query || !candidate) {
    return 0;
  }

  if (candidate === query) {
    return options?.exactScore ?? 0.97;
  }

  if (!options?.allowFuzzy) {
    return 0;
  }

  if (candidate.includes(query) || query.includes(candidate)) {
    // 用户说“会议室怎么预订”“年假怎么算”时，往往仍然指向某张已知制度卡。
    // 这里允许“去掉问法后的核心短语”与标题/关键词做轻量包含匹配，
    // 比纯精确命中更灵活，但又不会像语义检索那样放得太开。
    return 0.82;
  }

  return 0;
}

function scoreKnowledgeCardMatch(query: string, card: KnowledgeCard) {
  const titleScore = scoreKnowledgeCandidate(query, normalizeText(card.title), {
    exactScore: 0.97,
    allowFuzzy: true
  });
  const keywordScore = Math.max(
    0,
    ...card.keywords.map((keyword) =>
      scoreKnowledgeCandidate(query, normalizeText(keyword), {
        exactScore: 0.91,
        allowFuzzy: false
      })
    )
  );

  return Math.max(titleScore, keywordScore);
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
    const normalizedMatchQuery = normalizeMatchQuery(query);
    const normalizedSuggestionQuery = normalizeSuggestionQuery(query);

    const hits = this.cards
      .filter((card) => {
        if (options?.department && card.department !== options.department) {
          return false;
        }

        return true;
      })
      .map((card) => {
        const exactQueryScore = scoreKnowledgeCardMatch(normalizedQuery, card);
        const simplifiedQueryScore =
          normalizedMatchQuery && normalizedMatchQuery !== normalizedQuery
            ? scoreKnowledgeCardMatch(normalizedMatchQuery, card)
            : 0;
        const score = Math.max(exactQueryScore, simplifiedQueryScore);

        return {
          card,
          score
        };
      })
      .filter((candidate) => candidate.score >= MIN_FUZZY_MATCH_SCORE)
      .map(({ card, score }) => {
        return {
          id: card.id,
          title: card.title,
          question: card.title,
          answer: card.content,
          content: card.content,
          scope: card.scope ?? card.department,
          department: card.department,
          score,
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
