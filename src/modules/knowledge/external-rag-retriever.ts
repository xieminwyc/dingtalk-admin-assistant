import { normalizeKnowledgeDepartment } from "./knowledge-card.types";
import type {
  KnowledgeRetriever,
  KnowledgeSearchOptions,
  KnowledgeSearchResult
} from "./retriever.types";

export type ExternalRagDocument = {
  id: string;
  title: string;
  content: string;
  department?: string;
  score?: number;
  url?: string;
  headingPath?: string;
};

export interface ExternalRagProvider {
  search(input: {
    query: string;
    department?: string;
    userId?: string;
    sessionId?: string;
  }): Promise<ExternalRagDocument[]>;
}

export class ExternalRagRetriever implements KnowledgeRetriever {
  constructor(private readonly provider: ExternalRagProvider) {}

  async search(
    query: string,
    options?: KnowledgeSearchOptions
  ): Promise<KnowledgeSearchResult> {
    const documents = await this.provider.search({
      query,
      department: options?.department,
      userId: options?.userId,
      sessionId: options?.sessionId,
    });

    return {
      hits: documents.map((document) => {
        const normalizedDepartment = normalizeKnowledgeDepartment(
          document.department
        );

        return {
          id: document.id,
          title: document.title,
          question: document.title,
          answer: document.content,
          content: document.content,
          scope: normalizedDepartment,
          department: normalizedDepartment,
          score: document.score ?? 0.8,
          source: "rag" as const,
          url: document.url,
          // 如果存在标题则说明确实有真实引用，进行拼接，否则彻底不生成溯源字段
          referenceLabel: document.title ? (document.headingPath ? `${document.title} - ${document.headingPath}` : document.title) : undefined
        };
      }),
      relatedKeywords: []
    };
  }
}
