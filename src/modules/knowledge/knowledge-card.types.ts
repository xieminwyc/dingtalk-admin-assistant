export type KnowledgeDepartment = "HR" | "行政" | "IT";

export type KnowledgeCard = {
  id: string;
  title: string;
  content: string;
  department: KnowledgeDepartment;
  keywords: string[];
  scope?: string;
};
