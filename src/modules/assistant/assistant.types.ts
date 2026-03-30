import type { HandoffDecision } from "../handoff/handoff.service";

type AssistantIntentByKind = {
  knowledge: "knowledge_query";
  task: "task_request";
  contact: "handoff_request";
  handoff: "handoff_request";
  clarification: "unknown";
  open_response: "smalltalk";
};

export type AssistantKnowledgeResolution = {
  kind: "knowledge";
  intent: AssistantIntentByKind["knowledge"];
  // title 先留给后续卡片头部或标题区渲染，这里暂不直接拼进纯文本。
  title: string;
  answer: string;
  scope?: string;
  referenceLabel?: string;
};

export type AssistantTaskResolution = {
  kind: "task";
  intent: AssistantIntentByKind["task"];
  // title 先留给后续卡片头部或标题区渲染，这里暂不直接拼进纯文本。
  title: string;
  entry: string;
  guidance?: string;
  actionType?: "url" | "api";
  availability?: "available" | "unavailable" | "unknown";
  availabilityReason?: string;
};

export type AssistantContactResolution = {
  kind: "contact";
  intent: AssistantIntentByKind["contact"];
  title: string;
  contactName: string;
  team?: string;
  description: string;
  actionHint?: string;
};

export type AssistantHandoffResolution = {
  kind: "handoff";
  intent: AssistantIntentByKind["handoff"];
  reason: string;
};

export type AssistantClarificationResolution = {
  kind: "clarification";
  intent: AssistantIntentByKind["clarification"];
  prompt: string;
  reason?: string;
  // reasonCode 用来告诉回复层“为什么这次没有形成稳定答案”，
  // 这样生成器就能区分“完全没候选”还是“有候选但不够可靠”。
  reasonCode?: "no_candidate" | "low_confidence" | "need_disambiguation";
  relatedKeywords?: string[];
  handoff?: HandoffDecision;
};

export type AssistantOpenResponseResolution = {
  kind: "open_response";
  intent: AssistantIntentByKind["open_response"];
  reply: string;
};

export type AssistantResolution =
  | AssistantKnowledgeResolution
  | AssistantTaskResolution
  | AssistantContactResolution
  | AssistantHandoffResolution
  | AssistantClarificationResolution
  | AssistantOpenResponseResolution;
