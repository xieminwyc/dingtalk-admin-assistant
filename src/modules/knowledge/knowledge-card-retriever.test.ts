import { describe, expect, it } from "vitest";

import { KnowledgeCardRetriever } from "./knowledge-card-retriever";
import { sampleKnowledgeCards } from "./sample-knowledge-cards";

describe("KnowledgeCardRetriever", () => {
  const retriever = new KnowledgeCardRetriever(sampleKnowledgeCards);

  it("returns a hit for an exact title match", async () => {
    const result = await retriever.search("年假规则");

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.source).toBe("seed");
    expect(result.hits[0]?.title).toBe("年假规则");
    expect(result.hits[0]?.referenceLabel).toBe("年假规则");
    expect(result.hits[0]?.answer).toContain("司龄");
  });

  it("returns a hit for an exact keyword match", async () => {
    const result = await retriever.search("预订");

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.title).toBe("会议室预订");
    expect(result.hits[0]?.department).toBe("行政");
  });

  it("returns a finance knowledge hit for reimbursement questions", async () => {
    const result = await retriever.search("差旅报销标准");

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.title).toBe("差旅报销标准");
    expect(result.hits[0]?.department).toBe("财务");
  });

  it("applies department filtering when provided", async () => {
    const result = await retriever.search("申请", { department: "IT" });

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.title).toBe("权限申请说明");
    expect(result.hits[0]?.department).toBe("IT");
  });

  it("sorts hits by score in descending order", async () => {
    const sortingRetriever = new KnowledgeCardRetriever([
      {
        id: "card-keyword-first",
        title: "会议制度",
        content: "这是关键词命中的低分结果。",
        department: "行政",
        keywords: ["预订"]
      },
      {
        id: "card-title-second",
        title: "预订",
        content: "这是标题命中的高分结果。",
        department: "行政",
        keywords: ["预约"]
      }
    ]);

    const result = await sortingRetriever.search("预订");

    expect(result.hits).toHaveLength(2);
    expect(result.hits[0]?.id).toBe("card-title-second");
    expect(result.hits[0]?.score).toBeGreaterThan(result.hits[1]?.score ?? 0);
  });

  it("returns a fuzzy hit when the query clearly points to an existing card", async () => {
    const result = await retriever.search("会议室怎么预订");

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.title).toBe("会议室预订");
    expect(result.hits[0]?.score).toBeGreaterThanOrEqual(0.7);
    expect(result.relatedKeywords).toEqual([]);
  });

  it("returns related keywords when there is no confident card match", async () => {
    const result = await retriever.search("会议室制度");

    expect(result.hits).toEqual([]);
    expect(result.relatedKeywords).toContain("会议室预订");
  });

  it("returns no hits for unrelated queries", async () => {
    const result = await retriever.search("番茄炒蛋怎么做");

    expect(result.hits).toEqual([]);
    expect(result.relatedKeywords ?? []).toEqual([]);
  });
});
