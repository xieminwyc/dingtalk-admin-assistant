import type { HandoffDecision } from "../handoff/handoff.service";
import type { KnowledgeHit } from "../knowledge/retriever.types";

export function buildAssistantReply(input: {
  hit?: KnowledgeHit;
  handoff: HandoffDecision;
}) {
  // 只要没有稳定命中，就统一走保守回复，避免模型式“猜答案”。
  if (!input.hit || input.handoff.required) {
    return input.handoff.reason ?? "当前需要人工处理，请联系行政同学。";
  }

  // 先输出成纯文本结构，便于当前页面展示，也方便后续映射成钉钉卡片。
  const lines = [
    "结论",
    input.hit.answer,
    "",
    "适用范围",
    input.hit.scope ?? "请以行政制度为准"
  ];

  return lines.join("\n");
}
