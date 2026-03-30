import { describe, expect, expectTypeOf, it } from "vitest";

import type { AssistantMode } from "../intents/intent.types";
import type {
  AssistantClarificationResolution,
  AssistantKnowledgeResolution,
  AssistantTaskResolution
} from "./assistant.types";
import { buildAssistantReply } from "./reply-builder";

expectTypeOf<AssistantMode>().toEqualTypeOf<
  "internal_knowledge" | "task" | "open_response" | "clarify"
>();
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
      referenceLabel: "考勤制度"
    } satisfies AssistantKnowledgeResolution);

    expect(reply).toContain("补卡申请");
    expect(reply).toContain("适用范围");
    expect(reply).toContain("考勤制度");
  });

  it("builds a task guidance reply", () => {
    const reply = buildAssistantReply({
      kind: "task",
      intent: "task_request",
      title: "请假申请",
      entry: "在钉钉工作台进入请假入口",
      guidance: "选择请假类型后提交审批",
      availability: "available",
    } satisfies AssistantTaskResolution);

    expect(reply).toContain("请假入口");
    expect(reply).toContain("提交审批");
  });

  it("builds an unavailable task reply with the availability reason", () => {
    const reply = buildAssistantReply({
      kind: "task",
      intent: "task_request",
      title: "办公用品采购",
      entry: "暂未开放线上入口，请联系行政同学确认办理方式。",
      guidance: "请先准备采购清单。",
      availability: "unavailable",
      availabilityReason: "办公用品线上采购入口当前暂停开放。"
    } satisfies AssistantTaskResolution);

    expect(reply).toContain("当前状态");
    expect(reply).toContain("暂停开放");
  });

  it("builds a clarification fallback reply", () => {
    const reply = buildAssistantReply({
      kind: "clarification",
      intent: "unknown",
      prompt: "请补充更多信息",
      reason: "当前未找到可靠知识，请联系行政同学。",
      relatedKeywords: ["年假规则", "病假规则"]
    } satisfies AssistantClarificationResolution);

    expect(reply).toContain("请补充");
    expect(reply).toContain("联系行政同学");
    expect(reply).toContain("你可以试试");
  });

  it("builds an open-response fallback reply", () => {
    const reply = buildAssistantReply({
      kind: "open_response",
      intent: "smalltalk",
      reply: "你好呀，今天想聊点什么？"
    });

    expect(reply).toContain("今天想聊点什么");
  });
});
