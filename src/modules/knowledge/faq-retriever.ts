import type { FaqRecord } from "./sample-faq";
import type {
  KnowledgeRetriever,
  KnowledgeSearchResult
} from "./retriever.types";

function normalizeText(text: string) {
  // 先把最基础的空格和大小写差异抹平，够支撑一期 FAQ 检索。
  return text.trim().replace(/\s+/g, "").toLowerCase();
}

export class FaqKnowledgeRetriever implements KnowledgeRetriever {
  constructor(private readonly records: FaqRecord[]) {}

  async search(query: string): Promise<KnowledgeSearchResult> {
    const normalizedQuery = normalizeText(query);

    // 一期只做“标准问题 / 相似问法”的直接匹配，后续再升级成数据库或向量检索。
    const match = this.records.find((record) => {
      if (normalizeText(record.question) === normalizedQuery) {
        return true;
      }

      return record.aliases.some(
        (alias) => normalizeText(alias) === normalizedQuery
      );
    });

    if (!match) {
      return {
        hits: [],
        relatedKeywords: []
      };
    }

    return {
      hits: [
        {
          id: match.id,
          question: match.question,
          answer: match.answer,
          scope: match.scope,
          // 这里的分数先作为 handoff 判断输入，不代表完整的排序系统。
          score: normalizeText(match.question) === normalizedQuery ? 0.98 : 0.93,
          source: "faq",
          referenceLabel: match.question
        }
      ],
      relatedKeywords: []
    };
  }
}
