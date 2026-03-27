import { describe, expect, it, vi } from "vitest";

import { ExternalRagRetriever } from "./external-rag-retriever";
import { KnowledgeCardRetriever } from "./knowledge-card-retriever";
import { sampleKnowledgeCards } from "./sample-knowledge-cards";

describe("ExternalRagRetriever", () => {
  it("normalizes provider results into KnowledgeHit[]", async () => {
    const provider = {
      search: vi.fn().mockResolvedValue([
        {
          id: "rag-1",
          title: "年假规则",
          content: "年假天数按司龄计算，由 HR 制度执行。",
          department: "HR",
          score: 0.88,
          url: "https://example.com/hr/annual-leave"
        }
      ])
    };
    const retriever = new ExternalRagRetriever(provider);

    const hits = await retriever.search("年假规则", { department: "HR" });

    expect(provider.search).toHaveBeenCalledWith({
      query: "年假规则",
      department: "HR"
    });
    expect(hits).toEqual([
      {
        id: "rag-1",
        title: "年假规则",
        question: "年假规则",
        answer: "年假天数按司龄计算，由 HR 制度执行。",
        content: "年假天数按司龄计算，由 HR 制度执行。",
        scope: "HR",
        department: "HR",
        score: 0.88,
        source: "rag",
        url: "https://example.com/hr/annual-leave"
      }
    ]);
  });

  it("normalizes known provider department aliases into canonical departments", async () => {
    const provider = {
      search: vi.fn().mockResolvedValue([
        {
          id: "rag-2",
          title: "权限申请说明",
          content: "由 it 服务台处理。",
          department: "it"
        }
      ])
    };
    const retriever = new ExternalRagRetriever(provider);

    const hits = await retriever.search("权限申请说明");

    expect(hits).toEqual([
      expect.objectContaining({
        id: "rag-2",
        department: "IT",
        scope: "IT"
      })
    ]);
  });

  it("drops unknown provider departments instead of passing arbitrary strings through", async () => {
    const provider = {
      search: vi.fn().mockResolvedValue([
        {
          id: "rag-3",
          title: "供应商流程",
          content: "由采购流程处理。",
          department: "采购"
        }
      ])
    };
    const retriever = new ExternalRagRetriever(provider);

    const hits = await retriever.search("供应商流程");

    expect(hits).toEqual([
      expect.objectContaining({
        id: "rag-3",
        department: undefined,
        scope: undefined
      })
    ]);
  });

  it("surfaces provider failures instead of faking a successful result", async () => {
    const provider = {
      search: vi.fn().mockRejectedValue(new Error("provider unavailable"))
    };
    const retriever = new ExternalRagRetriever(provider);

    await expect(retriever.search("年假规则")).rejects.toThrow(
      "provider unavailable"
    );
  });

  it("allows the orchestration layer to fall back to local cards after provider failure", async () => {
    const provider = {
      search: vi.fn().mockRejectedValue(new Error("timeout"))
    };
    const externalRetriever = new ExternalRagRetriever(provider);
    const localRetriever = new KnowledgeCardRetriever(sampleKnowledgeCards);

    async function searchWithFallback(query: string) {
      try {
        return await externalRetriever.search(query);
      } catch {
        return localRetriever.search(query);
      }
    }

    const hits = await searchWithFallback("年假规则");

    expect(hits).toHaveLength(1);
    expect(hits[0]?.source).toBe("knowledge_card");
    expect(hits[0]?.title).toBe("年假规则");
  });
});
