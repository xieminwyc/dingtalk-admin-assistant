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
  source: "faq" | "seed" | "rag";
  url?: string;
  // 这个字段给后续“引用溯源”预留边界，便于把命中的制度名或文档名展示给用户。
  referenceLabel?: string;
};

export type KnowledgeSearchResult = {
  hits: KnowledgeHit[];
  // provider 无命中时，也要尽量给出“你是不是想问这些”的引导词，
  // 这样回复层就不用只能说一句“没找到”。
  relatedKeywords: string[];
};

export type KnowledgeSearchOptions = {
  department?: KnowledgeDepartment;
};

export interface KnowledgeRetriever {
  search(
    query: string,
    options?: KnowledgeSearchOptions
  ): Promise<KnowledgeSearchResult>;
}
