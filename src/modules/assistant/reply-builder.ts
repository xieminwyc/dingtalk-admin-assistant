import type { HandoffDecision } from "../handoff/handoff.service";
import type { KnowledgeHit } from "../knowledge/retriever.types";
import type { AssistantResolution } from "./assistant.types";

// 兼容旧版检索结果输入，方便 service 过渡期继续复用。
type LegacyAssistantReplyInput = {
  hit?: KnowledgeHit;
  handoff: HandoffDecision;
};

function formatKnowledgeReply(input: {
  title?: string;
  answer: string;
  scope?: string;
  referenceLabel?: string;
}) {
  const lines = [
    "知识主题",
    input.title ?? "制度答复",
    "",
    "结论",
    input.answer,
    "",
    "适用范围",
    input.scope ?? "请以行政制度为准"
  ];

  if (input.referenceLabel) {
    lines.push("", "依据", input.referenceLabel);
  }

  return lines.join("\n");
}

function formatTaskReply(input: {
  title: string;
  entry: string;
  guidance?: string;
  availability?: "available" | "unavailable" | "unknown";
  availabilityReason?: string;
}) {
  const lines = [
    "事务名称",
    input.title,
    "",
    "事务入口",
    input.entry,
    "",
    "操作指引",
    input.guidance ?? "请按入口提示继续办理"
  ];

  if (input.availability && input.availability !== "available") {
    lines.push(
      "",
      "当前状态",
      input.availabilityReason ?? "当前暂时无法确认是否可以直接办理。"
    );
  }

  return lines.join("\n");
}

function formatContactReply(input: {
  title?: string;
  contactName: string;
  team?: string;
  description: string;
  actionHint?: string;
}) {
  return [
    "对接事项",
    input.title ?? "人工协作",
    "",
    "对接建议",
    input.contactName,
    input.team ? `团队：${input.team}` : undefined,
    "",
    input.description,
    input.actionHint ? `建议动作：${input.actionHint}` : undefined
  ]
    .filter(Boolean)
    .join("\n");
}

function formatClarificationReply(input: {
  prompt: string;
  reason?: string;
  relatedKeywords?: string[];
  handoff?: HandoffDecision;
}) {
  const suggestion =
    input.relatedKeywords && input.relatedKeywords.length > 0
      ? `你可以试试：${input.relatedKeywords.join("、")}`
      : undefined;

  return [input.prompt, input.reason ?? input.handoff?.reason, suggestion]
    .filter(Boolean)
    .join("\n");
}

function assertNever(value: never): never {
  throw new Error(`Unhandled assistant resolution kind: ${String(value)}`);
}

function buildReplyFromResolution(input: AssistantResolution) {
  switch (input.kind) {
    case "knowledge":
      return formatKnowledgeReply(input);
    case "task":
      return formatTaskReply(input);
    case "contact":
      return formatContactReply(input);
    case "clarification":
      return formatClarificationReply(input);
    case "handoff":
      return input.reason;
    case "open_response":
      return input.reply;
    default:
      return assertNever(input);
  }
}

function buildReplyFromLegacyInput(input: LegacyAssistantReplyInput) {
  // 只要没有稳定命中，就统一走保守回复，避免模型式“猜答案”。
  if (!input.hit || input.handoff.required) {
    return input.handoff.reason ?? "当前需要人工处理，请联系行政同学。";
  }

  // 先输出成纯文本结构，便于当前页面展示，也方便后续映射成钉钉卡片。
  return formatKnowledgeReply(input.hit);
}

export function buildAssistantReply(input: AssistantResolution): string;
export function buildAssistantReply(input: LegacyAssistantReplyInput): string;
export function buildAssistantReply(
  input: AssistantResolution | LegacyAssistantReplyInput
) {
  if ("kind" in input) {
    return buildReplyFromResolution(input);
  }

  return buildReplyFromLegacyInput(input);
}
