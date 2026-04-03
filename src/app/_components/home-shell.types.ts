import type { EntryMode } from "@/modules/assistant/entry-mode.types";

export type HomeView = "home" | "drilldown" | "chat";

export type ChatResultKind =
  | "knowledge"
  | "task"
  | "contact"
  | "clarification"
  | "handoff"
  | "open_response"
  | "placeholder";

export type ChatCitation = {
  documentTitle: string;
  sourceUrl?: string;
};

export type ChatImage = {
  name: string;
  data?: string;
  preview?: string;
};

export type ChatEntryMeta = {
  title?: string;
  scope?: string;
  contactName?: string;
  team?: string;
  entry?: string;
  actionHint?: string;
};

export type ConversationSummary = {
  sessionId: string;
  title: string;
  updatedAt: number;
  isCurrent?: boolean;
};

export type ChatEntry = {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode?: EntryMode | null;
  kind?: ChatResultKind | null;
  isThinking?: boolean;
  isError?: boolean;
  citations?: ChatCitation[];
  images?: ChatImage[];
  meta?: ChatEntryMeta;
};
