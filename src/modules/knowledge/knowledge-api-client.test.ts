import { afterEach, describe, expect, it, vi } from "vitest";

import { KnowledgeApiClient } from "./knowledge-api-client";

describe("KnowledgeApiClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs the full successful response payload without truncation", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const client = new KnowledgeApiClient({
      baseUrl: "http://127.0.0.1:13718",
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        json: async () => ({
          sessionId: "session-1",
          answer:
            "公司的报销流程如下：1. 员工发起报销申请；2. 提交审批；3. 财务复核；4. 完成打款。",
          source: ["https://alidocs.dingtalk.com/i/nodes/xxx"],
          pics: [
            {
              name: "图1",
              data: "iVBORw0KGgoAAAANSUhEUgAAAAUA",
              preview: "报销流程示意图...",
            },
          ],
        }),
      } as Response),
    });

    await client.ask({
      question: "报销流程是什么？",
      operatorId: "user-1",
      maxSources: 5,
      excludeImageData: false,
    });

    expect(logSpy).toHaveBeenCalledWith(
      "✅ [KnowledgeApiClient] 请求成功, 收到数据:",
      JSON.stringify({
        sessionId: "session-1",
        answer:
          "公司的报销流程如下：1. 员工发起报销申请；2. 提交审批；3. 财务复核；4. 完成打款。",
        source: ["https://alidocs.dingtalk.com/i/nodes/xxx"],
        pics: [
          {
            name: "图1",
            data: "iVBORw0KGgoAAAANSUhEUgAAAAUA",
            preview: "报销流程示意图...",
          },
        ],
      }),
    );
  });

  it("passes search excludeImageData through to the search endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [],
        total: 0,
      }),
    } as Response);
    const client = new KnowledgeApiClient({
      baseUrl: "http://127.0.0.1:13718",
      fetchImpl: fetchMock,
    });

    await client.search({
      query: "报销流程",
      operatorId: "user-2",
      excludeImageData: true,
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://127.0.0.1:13718/api/v1/knowledge/search",
    );
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)),
    ).toMatchObject({
      query: "报销流程",
      operatorId: "user-2",
      excludeImageData: true,
    });
  });

  it("requests citation details from the documented citation endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        chunkId: 123,
        documentId: 456,
        documentTitle: "员工手册 2025",
        sourceUrl: "https://alidocs.dingtalk.com/i/nodes/xxx",
        chunkText: "年假申请需提前 3 个工作日...",
        createdAt: "2025-01-15T08:00:00Z",
      }),
    } as Response);
    const client = new KnowledgeApiClient({
      baseUrl: "http://127.0.0.1:13718",
      fetchImpl: fetchMock,
    });

    await client.getCitation(123);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://127.0.0.1:13718/api/v1/knowledge/citation/123",
    );
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("GET");
  });

  it("posts to the documented ask stream endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      text: async () =>
        'data: {"type":"chunk","content":"根据"}\n\ndata: [DONE]\n',
    } as Response);
    const client = new KnowledgeApiClient({
      baseUrl: "http://127.0.0.1:13718",
      fetchImpl: fetchMock,
    });

    await client.askStream({
      question: "出差住宿标准是多少？",
      operatorId: "user-3",
      sessionId: "session-3",
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://127.0.0.1:13718/api/v1/knowledge/ask/stream",
    );
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
  });

  it("deletes knowledge sessions through the documented session endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => ({}),
      text: async () => "",
    } as Response);
    const client = new KnowledgeApiClient({
      baseUrl: "http://127.0.0.1:13718",
      fetchImpl: fetchMock,
    });

    await client.clearSession("session-4");

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://127.0.0.1:13718/api/v1/knowledge/sessions/session-4",
    );
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("DELETE");
  });
});
