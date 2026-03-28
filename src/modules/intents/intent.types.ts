export type IntentType =
  | "knowledge_query"
  | "task_request"
  | "handoff_request"
  | "smalltalk"
  | "unknown";

// 第二阶段开始引入更贴近产品体验的顶层模式。
// 这里先把新契约补进来，后续重构时可以逐步替换旧的 IntentType。
export type AssistantMode = "knowledge" | "task" | "chat" | "clarify";

export type AssistantDecision = {
  mode: AssistantMode;
  intentConfidence: number;
  needKnowledge: boolean;
  needTaskResolution: boolean;
  topicShift: boolean;
  contextBreakConfidence?: number;
  clarifyQuestion?: string;
  knowledgeHint?: string;
  taskHint?: string;
};
