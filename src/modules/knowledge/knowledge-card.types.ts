export type KnowledgeDepartment = "HR" | "财务" | "行政" | "IT";

const KNOWN_DEPARTMENT_ALIASES: Record<string, KnowledgeDepartment> = {
  hr: "HR",
  humanresources: "HR",
  人力: "HR",
  人力资源: "HR",
  财务: "财务",
  finance: "财务",
  行政: "行政",
  admin: "行政",
  administration: "行政",
  it: "IT",
  信息技术: "IT",
  技术支持: "IT"
};

function normalizeDepartmentText(value: string) {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}

export function normalizeKnowledgeDepartment(
  value?: string
): KnowledgeDepartment | undefined {
  if (!value) {
    return undefined;
  }

  // 外部 provider 只允许折叠到当前已知部门，未知值先丢弃，避免污染统一契约。
  return KNOWN_DEPARTMENT_ALIASES[normalizeDepartmentText(value)];
}

export type KnowledgeCard = {
  id: string;
  title: string;
  content: string;
  department: KnowledgeDepartment;
  keywords: string[];
  scope?: string;
};
