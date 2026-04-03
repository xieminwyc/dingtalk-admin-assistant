import { describe, expect, it } from "vitest";

import {
  buildKnowledgeHint,
  isShortKnowledgeFollowUp,
  looksLikeCompanyKnowledgeQuery,
  shouldReclassifyOpenResponseAsKnowledge,
  shouldReclassifyTaskAsKnowledge,
} from "./company-knowledge-heuristics";
import type { AssistantDecision } from "./intent.types";

describe("company knowledge heuristics", () => {
  it("recognizes obvious company knowledge queries", () => {
    expect(looksLikeCompanyKnowledgeQuery("OA 费用报销申请怎么填")).toBe(true);
    expect(looksLikeCompanyKnowledgeQuery("报销单怎么写")).toBe(true);
    expect(looksLikeCompanyKnowledgeQuery("考勤异常怎么填")).toBe(true);
    expect(looksLikeCompanyKnowledgeQuery("北京七日游攻略")).toBe(false);
  });

  it("recognizes short company-knowledge follow-up questions in a knowledge context", () => {
    expect(
      isShortKnowledgeFollowUp("那迟到呢", [
        { role: "user", content: "上班时间是什么" },
        { role: "assistant", content: "我来按制度给你查。" },
      ]),
    ).toBe(true);

    expect(
      isShortKnowledgeFollowUp("那迟到呢", [
        { role: "user", content: "帮我写一封请假邮件" },
        { role: "assistant", content: "当然可以。" },
      ]),
    ).toBe(false);
  });

  it("builds cleaner knowledge hints from common question suffixes", () => {
    expect(buildKnowledgeHint("那上班时间呢")).toBe("上班时间");
    expect(buildKnowledgeHint("报销流程是什么")).toBe("报销流程");
    expect(buildKnowledgeHint("OA 费用报销申请怎么填")).toBe(
      "OA 费用报销申请怎么填",
    );
  });

  it("reclassifies descriptive task-like questions back to knowledge", () => {
    const decision = {
      mode: "task",
      intentConfidence: 0.88,
      needKnowledge: false,
      needTaskResolution: true,
      toolPlan: "task",
      topicShift: false,
      taskHint: "expense_application",
    } satisfies AssistantDecision;

    expect(
      shouldReclassifyTaskAsKnowledge("报销流程是什么", decision),
    ).toBe(true);
    expect(
      shouldReclassifyTaskAsKnowledge("我要申请报销", decision),
    ).toBe(false);
  });

  it("reclassifies obvious company knowledge queries from open response", () => {
    const decision = {
      mode: "open_response",
      intentConfidence: 0.71,
      needKnowledge: false,
      needTaskResolution: false,
      toolPlan: "none",
      topicShift: false,
      reply: "你可以补充一点背景。",
    } satisfies AssistantDecision;

    expect(
      shouldReclassifyOpenResponseAsKnowledge(
        {
          query: "报销单怎么写",
        },
        decision,
      ),
    ).toBe(true);

    expect(
      shouldReclassifyOpenResponseAsKnowledge(
        {
          query: "今天天气怎么样",
        },
        decision,
      ),
    ).toBe(false);
  });
});
