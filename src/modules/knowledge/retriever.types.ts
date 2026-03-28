import type { KnowledgeDepartment } from "./knowledge-card.types";

// KnowledgeHit 是检索层和回复层之间的统一数据格式，
// 这样以后无论数据来自 FAQ 还是外部 RAG，assistant service 都不用重写。
export type KnowledgeHit = {
  id: string;
  question: string;
  answer: string;
  title?: string;
  content?: string;
  scope?: string;
  department?: KnowledgeDepartment;
  score: number;
  source: "faq" | "knowledge_card" | "rag";
  url?: string;
  // 这个字段给后续“引用溯源”预留边界，便于把命中的制度名或文档名展示给用户。
  referenceLabel?: string;
  // 这个字段先作为可选契约存在，后续 provider 会逐步补上更智能的引导关键词。
  relatedKeywords?: string[];
};

export type KnowledgeSearchOptions = {
  department?: KnowledgeDepartment;
};

export interface KnowledgeRetriever {
  search(query: string, options?: KnowledgeSearchOptions): Promise<KnowledgeHit[]>;
}
