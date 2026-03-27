import type {
  KnowledgeHit,
  KnowledgeRetriever,
  KnowledgeSearchOptions
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
  ): Promise<KnowledgeHit[]> {
    const documents = await this.provider.search({
      query,
      department: options?.department
    });

    return documents.map((document) => ({
      id: document.id,
      title: document.title,
      question: document.title,
      answer: document.content,
      content: document.content,
      scope: document.department,
      department: document.department,
      score: document.score ?? 0.8,
      source: "rag",
      url: document.url
    }));
  }
}
