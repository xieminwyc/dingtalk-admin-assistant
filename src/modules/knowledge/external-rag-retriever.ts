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
};

export interface ExternalRagProvider {
  search(input: {
    query: string;
    department?: string;
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
      department: options?.department
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
          // 外部 RAG 一期先直接用标题当引用标签，后续如果 provider 提供更细的 citation，
          // 可以在不改上层调用方的前提下继续扩展。
          referenceLabel: document.title
        };
      }),
      relatedKeywords: []
    };
  }
}
