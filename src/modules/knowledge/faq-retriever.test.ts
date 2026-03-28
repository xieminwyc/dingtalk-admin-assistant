import { describe, expect, it } from "vitest";

import { FaqKnowledgeRetriever } from "./faq-retriever";

describe("FaqKnowledgeRetriever", () => {
  const retriever = new FaqKnowledgeRetriever([
    {
      id: "faq-1",
      question: "补卡流程是什么",
      aliases: ["忘记打卡怎么办", "漏打卡了怎么处理"],
      answer: "进入审批后发起补卡申请，由直属主管审批。",
      scope: "适用于因漏打卡产生异常的员工"
    }
  ]);

  it("returns a hit for the standard question", async () => {
    const result = await retriever.search("补卡流程是什么");

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.source).toBe("faq");
    expect(result.hits[0]?.answer).toContain("补卡申请");
  });

  it("returns a hit for an alias question", async () => {
    const result = await retriever.search("忘记打卡怎么办");

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.question).toBe("补卡流程是什么");
  });

  it("returns no hits for unrelated questions", async () => {
    const result = await retriever.search("午饭吃什么");

    expect(result).toEqual({
      hits: [],
      relatedKeywords: []
    });
  });
});
