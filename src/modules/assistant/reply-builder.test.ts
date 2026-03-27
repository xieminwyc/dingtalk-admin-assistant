import { describe, expect, it } from "vitest";

import { buildAssistantReply } from "./reply-builder";

describe("buildAssistantReply", () => {
  it("builds a structured answer for a FAQ hit", () => {
    const reply = buildAssistantReply({
      hit: {
        id: "faq-1",
        question: "补卡流程是什么",
        answer: "进入审批后发起补卡申请，由直属主管审批。",
        scope: "适用于因漏打卡产生异常的员工",
        score: 0.98,
        source: "faq"
      },
      handoff: {
        required: false
      }
    });

    expect(reply).toContain("结论");
    expect(reply).toContain("补卡申请");
    expect(reply).toContain("适用范围");
  });

  it("builds a fallback answer when handoff is required", () => {
    const reply = buildAssistantReply({
      handoff: {
        required: true,
        reason: "当前未找到可靠知识，请联系行政同学。"
      }
    });

    expect(reply).toContain("请联系");
  });
});
