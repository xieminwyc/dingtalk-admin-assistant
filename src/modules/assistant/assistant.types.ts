import type { IntentType } from "../intents/intent.types";
import type { HandoffDecision } from "../handoff/handoff.service";

export type AssistantKnowledgeResolution = {
  kind: "knowledge";
  intent: IntentType;
  title: string;
  answer: string;
  scope?: string;
};

export type AssistantTaskResolution = {
  kind: "task";
  intent: IntentType;
  title: string;
  entry: string;
  guidance?: string;
};

export type AssistantHandoffResolution = {
  kind: "handoff";
  intent: IntentType;
  reason: string;
};

export type AssistantClarificationResolution = {
  kind: "clarification";
  intent: IntentType;
  prompt: string;
  reason?: string;
  handoff?: HandoffDecision;
};

export type AssistantSmalltalkResolution = {
  kind: "smalltalk";
  intent: IntentType;
  reply: string;
};

export type AssistantResolution =
  | AssistantKnowledgeResolution
  | AssistantTaskResolution
  | AssistantHandoffResolution
  | AssistantClarificationResolution
  | AssistantSmalltalkResolution;
