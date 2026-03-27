// KnowledgeHit 是检索层和回复层之间的统一数据格式，
// 这样以后无论数据来自 FAQ 还是外部 RAG，assistant service 都不用重写。
export type KnowledgeHit = {
  id: string;
  question: string;
  answer: string;
  scope?: string;
  score: number;
  source: "faq" | "rag";
};

export interface KnowledgeRetriever {
  search(query: string): Promise<KnowledgeHit[]>;
}
