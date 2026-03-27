import type { HandoffDecision } from "../handoff/handoff.service";

type AssistantIntentByKind = {
  knowledge: "knowledge_query";
  task: "task_request";
  handoff: "handoff_request";
  clarification: "unknown";
  smalltalk: "smalltalk";
};

export type AssistantKnowledgeResolution = {
  kind: "knowledge";
  intent: AssistantIntentByKind["knowledge"];
  // title 先留给后续卡片头部或标题区渲染，这里暂不直接拼进纯文本。
  title: string;
  answer: string;
  scope?: string;
};

export type AssistantTaskResolution = {
  kind: "task";
  intent: AssistantIntentByKind["task"];
  // title 先留给后续卡片头部或标题区渲染，这里暂不直接拼进纯文本。
  title: string;
  entry: string;
  guidance?: string;
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
  handoff?: HandoffDecision;
};

export type AssistantSmalltalkResolution = {
  kind: "smalltalk";
  intent: AssistantIntentByKind["smalltalk"];
  reply: string;
};

export type AssistantResolution =
  | AssistantKnowledgeResolution
  | AssistantTaskResolution
  | AssistantHandoffResolution
  | AssistantClarificationResolution
  | AssistantSmalltalkResolution;
