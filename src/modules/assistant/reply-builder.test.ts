import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  AssistantClarificationResolution,
  AssistantKnowledgeResolution,
  AssistantTaskResolution
} from "./assistant.types";
import { buildAssistantReply } from "./reply-builder";

expectTypeOf<AssistantKnowledgeResolution["intent"]>().toEqualTypeOf<"knowledge_query">();
expectTypeOf<AssistantTaskResolution["intent"]>().toEqualTypeOf<"task_request">();
expectTypeOf<AssistantClarificationResolution["intent"]>().toEqualTypeOf<"unknown">();

describe("buildAssistantReply", () => {
  it("builds a knowledge reply", () => {
    const reply = buildAssistantReply({
      kind: "knowledge",
      intent: "knowledge_query",
      title: "补卡流程",
      answer: "进入审批后发起补卡申请，由直属主管审批。",
      scope: "适用于因漏打卡产生异常的员工",
    } satisfies AssistantKnowledgeResolution);

    expect(reply).toContain("补卡申请");
    expect(reply).toContain("适用范围");
  });

  it("builds a task guidance reply", () => {
    const reply = buildAssistantReply({
      kind: "task",
      intent: "task_request",
      title: "请假申请",
      entry: "在钉钉工作台进入请假入口",
      guidance: "选择请假类型后提交审批",
    } satisfies AssistantTaskResolution);

    expect(reply).toContain("请假入口");
    expect(reply).toContain("提交审批");
  });

  it("builds a clarification fallback reply", () => {
    const reply = buildAssistantReply({
      kind: "clarification",
      intent: "unknown",
      prompt: "请补充更多信息",
      reason: "当前未找到可靠知识，请联系行政同学。"
    } satisfies AssistantClarificationResolution);

    expect(reply).toContain("请补充");
    expect(reply).toContain("联系行政同学");
  });
});
