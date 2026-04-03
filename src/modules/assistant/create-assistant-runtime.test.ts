import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createAssistantRuntime,
  createExternalRagProvider,
} from "./create-assistant-runtime";

describe("createAssistantRuntime", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    );
  });

  async function createKnowledgeDir() {
    const directory = await mkdtemp(join(tmpdir(), "mt-runtime-knowledge-"));
    const knowledgeDir = join(directory, "knowledge");
    tempDirs.push(directory);
    await mkdir(knowledgeDir, { recursive: true });
    await writeFile(
      join(knowledgeDir, "假勤管理办法.md"),
      `# 员工假勤管理办法

## 异常处理（豁免与乐捐）
### 迟到扣款处理标准
迟到 15-30 分钟不可豁免，按 2 元/分钟进行乐捐。
`,
      "utf8"
    );

    return knowledgeDir;
  }

  it("prefers local markdown documents as the default knowledge source", async () => {
    const knowledgeDocsDir = await createKnowledgeDir();
    const runtime = createAssistantRuntime({
      env: {},
      knowledgeDocsDir
    });

    const result = await runtime.localRetriever.search("迟到扣钱制度");

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.source).toBe("document");
    expect(result.hits[0]?.referenceLabel).toContain("员工假勤管理办法");
  });

  it("calls the external synchronous ask API with the updated request shape", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        sessionId: "rag-session-1",
        answer: "报销需要先提交申请。",
        source: ["https://alidocs.example.com/doc-1"],
        pics: [],
      }),
    } as Response);

    const provider = createExternalRagProvider({
      ragApiUrl: "http://127.0.0.1:13718",
      ragApiKey: "test-key",
      fetchImpl: fetchMock,
    });

    const result = await provider.search({
      query: "报销流程是什么？",
      userId: "user-1",
      sessionId: "chat-session-1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://127.0.0.1:13718/api/v1/knowledge/ask",
    );
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)),
    ).toMatchObject({
      question: "报销流程是什么？",
      operatorId: "user-1",
      maxSources: 5,
      excludeImageData: false,
    });
    expect(result).toEqual([
      {
        id: "rag-session-1",
        title: "doc-1",
        content: "报销需要先提交申请。",
        score: 1,
        url: "https://alidocs.example.com/doc-1",
        citations: [
          {
            documentTitle: "doc-1",
            sourceUrl: "https://alidocs.example.com/doc-1",
          },
        ],
        images: [],
        providerMeta: {
          ragAskResponse: {
            sessionId: "rag-session-1",
            answer: "报销需要先提交申请。",
            source: ["https://alidocs.example.com/doc-1"],
            pics: [],
          },
        },
        headingPath: undefined,
      },
    ]);
  });

  it("prefers real document titles from search results for citations", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionId: "rag-session-title-1",
          answer: "报销要求以制度原文为准。",
          source: [
            "https://alidocs.dingtalk.com/i/nodes/ydxXB52LJqe7j5PATQOZGldZJqjMp697",
          ],
          pics: [],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              chunkId: 1,
              documentId: 2,
              title: "沐腾费用报销流程及须知事项20260310.pdf",
              chunkText: "报销要求以制度原文为准。",
              score: 0.96,
              sourceUrl:
                "https://alidocs.dingtalk.com/i/nodes/ydxXB52LJqe7j5PATQOZGldZJqjMp697",
            },
          ],
          total: 1,
        }),
      } as Response);

    const provider = createExternalRagProvider({
      ragApiUrl: "http://127.0.0.1:13718",
      fetchImpl: fetchMock,
    });

    const result = await provider.search({
      query: "报销要求是什么？",
      userId: "user-title-1",
      sessionId: "chat-title-1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "http://127.0.0.1:13718/api/v1/knowledge/search",
    );
    expect(result).toEqual([
      expect.objectContaining({
        title: "沐腾费用报销流程及须知事项20260310.pdf",
        citations: [
          {
            documentTitle: "沐腾费用报销流程及须知事项20260310.pdf",
            sourceUrl:
              "https://alidocs.dingtalk.com/i/nodes/ydxXB52LJqe7j5PATQOZGldZJqjMp697",
          },
        ],
      }),
    ]);
  });

  it("reuses the mapped external session id on follow-up questions", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionId: "rag-session-a",
          answer: "首次回答",
          source: ["https://alidocs.example.com/doc-a"],
          pics: [],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionId: "rag-session-b",
          answer: "追问回答",
          source: ["https://alidocs.example.com/doc-b"],
          pics: [],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionId: "rag-session-b",
          answer: "再次追问回答",
          source: ["https://alidocs.example.com/doc-c"],
          pics: [],
        }),
      } as Response);

    const provider = createExternalRagProvider({
      ragApiUrl: "http://127.0.0.1:13718",
      fetchImpl: fetchMock,
    });

    await provider.search({
      query: "首次提问",
      userId: "user-2",
      sessionId: "chat-session-2",
    });
    await provider.search({
      query: "继续追问",
      userId: "user-2",
      sessionId: "chat-session-2",
    });
    await provider.search({
      query: "第三次追问",
      userId: "user-2",
      sessionId: "chat-session-2",
    });

    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)),
    ).not.toHaveProperty("sessionId");
    expect(
      JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)),
    ).toMatchObject({
      sessionId: "rag-session-a",
    });
    expect(
      JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body)),
    ).toMatchObject({
      sessionId: "rag-session-b",
    });
  });

  it("returns an empty result on timeout so routing can fall back locally", async () => {
    const provider = createExternalRagProvider({
      ragApiUrl: "http://127.0.0.1:13718",
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockRejectedValue(new Error("request timeout")),
    });

    await expect(
      provider.search({
        query: "住宿标准",
        userId: "user-3",
        sessionId: "chat-session-3",
      }),
    ).resolves.toEqual([]);
  });

  it("marks vague fallback answers as low confidence so router can use local knowledge", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        sessionId: "rag-session-4",
        answer:
          "根据提供的文档片段，虽然没有直接描述具体的考勤制度内容，但可以总结出考勤制度在实际操作中需要结合审批流程理解。",
        source: ["https://alidocs.example.com/doc-4"],
        pics: [],
      }),
    } as Response);

    const provider = createExternalRagProvider({
      ragApiUrl: "http://127.0.0.1:13718",
      fetchImpl: fetchMock,
    });

    const result = await provider.search({
      query: "考勤制度",
      userId: "user-4",
      sessionId: "chat-session-4",
    });

    expect(result).toEqual([
      expect.objectContaining({
        id: "rag-session-4",
        content: expect.stringContaining("虽然没有直接描述具体的考勤制度内容"),
        score: 0.3,
      }),
    ]);
  });
});
