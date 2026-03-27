import type { HandoffDecision } from "../handoff/handoff.service";
import type { KnowledgeHit } from "../knowledge/retriever.types";
import type {
  AssistantResolution,
  AssistantTaskResolution,
  AssistantKnowledgeResolution,
  AssistantClarificationResolution,
  AssistantHandoffResolution,
  AssistantSmalltalkResolution
} from "./assistant.types";

type LegacyAssistantReplyInput = {
  hit?: KnowledgeHit;
  handoff: HandoffDecision;
};

function formatKnowledgeReply(input: {
  title: string;
  answer: string;
  scope?: string;
}) {
  const lines = [
    "结论",
    input.answer,
    "",
    "适用范围",
    input.scope ?? "请以行政制度为准"
  ];

  return lines.join("\n");
}

function formatTaskReply(input: { title: string; entry: string; guidance?: string }) {
  const lines = [
    "事务入口",
    input.entry,
    "",
    "操作指引",
    input.guidance ?? "请按入口提示继续办理"
  ];

  return lines.join("\n");
}

function formatClarificationReply(input: {
  prompt: string;
  reason?: string;
  handoff?: HandoffDecision;
}) {
  return [input.prompt, input.reason ?? input.handoff?.reason]
    .filter(Boolean)
    .join("\n");
}

export function buildAssistantReply(
  input: AssistantResolution | LegacyAssistantReplyInput
) {
  if ("kind" in input) {
    if (input.kind === "knowledge") {
      return formatKnowledgeReply(input as AssistantKnowledgeResolution);
    }

    if (input.kind === "task") {
      return formatTaskReply(input as AssistantTaskResolution);
    }

    if (input.kind === "clarification") {
      return formatClarificationReply(input as AssistantClarificationResolution);
    }

    if (input.kind === "handoff") {
      return (input as AssistantHandoffResolution).reason;
    }

    return (input as AssistantSmalltalkResolution).reply;
  }

  // 只要没有稳定命中，就统一走保守回复，避免模型式“猜答案”。
  if (!input.hit || input.handoff.required) {
    return input.handoff.reason ?? "当前需要人工处理，请联系行政同学。";
  }

  // 先输出成纯文本结构，便于当前页面展示，也方便后续映射成钉钉卡片。
  return formatKnowledgeReply(input.hit);
}
