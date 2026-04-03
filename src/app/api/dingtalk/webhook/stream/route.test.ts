import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function importFreshRoute() {
  const routeModule = await import("./route");
  return routeModule.POST;
}

function readSseEvents(payload: string) {
  return payload
    .split("\n\n")
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => block.replace(/^data:\s*/u, ""))
    .filter((line) => line !== "[DONE]")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("POST /api/dingtalk/webhook/stream", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/modules/assistant/create-assistant-runtime");
    vi.resetModules();
  });

  it("logs the incoming sender identifiers and resolved user id", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    vi.doMock("@/modules/assistant/create-assistant-runtime", () => ({
      createAssistantRuntime: () => ({
        analyzer: {
          analyze: vi.fn().mockResolvedValue({
            mode: "task",
            intentConfidence: 0.91,
            needKnowledge: false,
            needTaskResolution: true,
            toolPlan: "task",
            topicShift: false,
            intent: "task_request",
            source: "model",
          }),
        },
        assistant: {
          replyWithDebug: vi.fn().mockResolvedValue({
            reply: "已为你打开 OA 入口。",
            conversationContext: [],
            intent: {
              mode: "task",
              intentConfidence: 0.91,
              needKnowledge: false,
              needTaskResolution: true,
              toolPlan: "task",
              topicShift: false,
              intent: "task_request",
              source: "model",
            },
            resolution: {
              kind: "task",
              intent: "task_request",
              title: "OA 入口",
              entry: "https://oa.example.com",
              guidance: "请按入口提示继续办理",
            },
            usedResponseGenerator: false,
          }),
        },
      }),
    }));

    const post = await importFreshRoute();
    await post(
      new Request("http://localhost/api/dingtalk/webhook/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: "home-task-log-1",
          senderId: "0215084121561138029",
          text: {
            content: "帮我打开 OA",
          },
        }),
      }),
    );

    expect(infoSpy).toHaveBeenCalledWith(
      "[webhook/stream] incoming sender",
      expect.objectContaining({
        senderId: "0215***8029",
        senderStaffId: undefined,
        resolvedUserId: "0215***8029",
        sessionId: "home-task-log-1",
      }),
    );

    vi.doUnmock("@/modules/assistant/create-assistant-runtime");
  });

  it("streams external knowledge chunks and done metadata for knowledge requests", async () => {
    vi.doMock("@/modules/assistant/create-assistant-runtime", () => {
      const analyze = vi.fn().mockResolvedValue({
        mode: "internal_knowledge",
        intentConfidence: 0.94,
        needKnowledge: true,
        needTaskResolution: false,
        toolPlan: "knowledge",
        topicShift: false,
        intent: "knowledge_query",
        source: "model",
      });
      const askStream = vi.fn().mockResolvedValue(
        new Response(
          [
            'data: {"type":"chunk","content":"根据"}',
            "",
            'data: {"type":"chunk","content":"报销制度，先提交申请。"}',
            "",
            'data: {"type":"done","sessionId":"rag-session-1","sources":[{"chunkId":1,"documentId":2,"title":"费用报销制度","chunkText":"报销流程图","score":0.95,"sourceUrl":"https://alidocs.dingtalk.com/i/nodes/xxx","imageData":"base64-image"}]}',
            "",
            "data: [DONE]",
            "",
          ].join("\n"),
          {
            headers: {
              "Content-Type": "text/event-stream",
            },
          },
        ),
      );
      const getMappedSessionId = vi.fn().mockReturnValue("rag-session-old");
      const setMappedSessionId = vi.fn();

      return {
        createAssistantRuntime: () => ({
          analyzer: { analyze },
          assistant: {
            replyWithDebug: vi.fn(),
          },
          externalKnowledge: {
            askStream,
            getMappedSessionId,
            setMappedSessionId,
          },
        }),
      };
    });

    const post = await importFreshRoute();
    const response = await post(
      new Request("http://localhost/api/dingtalk/webhook/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: "home-knowledge-1",
          senderId: "user-1",
          text: {
            content: "报销流程是什么",
          },
        }),
      }),
    );

    const payload = await response.text();
    const events = readSseEvents(payload);
    const runtime = (await import("@/modules/assistant/create-assistant-runtime"))
      .createAssistantRuntime();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    expect(runtime.externalKnowledge?.askStream).toHaveBeenCalledWith({
      question: "报销流程是什么",
      operatorId: "user-1",
      sessionId: "rag-session-old",
      maxSources: 5,
      excludeImageData: false,
    });
    expect(events).toEqual([
      {
        type: "chunk",
        content: "根据",
      },
      {
        type: "chunk",
        content: "报销制度，先提交申请。",
      },
      {
        type: "done",
        reply: "根据报销制度，先提交申请。",
        kind: "knowledge",
        citations: [
          {
            documentTitle: "费用报销制度",
            sourceUrl: "https://alidocs.dingtalk.com/i/nodes/xxx",
          },
        ],
        images: [
          {
            name: "图1",
            data: "base64-image",
            preview: "报销流程图",
          },
        ],
        meta: {
          title: "费用报销制度",
        },
      },
    ]);
    expect(runtime.externalKnowledge?.setMappedSessionId).toHaveBeenCalledWith(
      "home-knowledge-1",
      "rag-session-1",
    );

    vi.doUnmock("@/modules/assistant/create-assistant-runtime");
  });

  it("hydrates streamed images from source imageUrl when imageData is absent", async () => {
    process.env.RAG_API_URL = "http://rag.example.com";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(Uint8Array.from([137, 80, 78, 71]), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
        },
      }),
    );

    vi.doMock("@/modules/assistant/create-assistant-runtime", () => ({
      createAssistantRuntime: () => ({
        analyzer: {
          analyze: vi.fn().mockResolvedValue({
            mode: "internal_knowledge",
            intentConfidence: 0.94,
            needKnowledge: true,
            needTaskResolution: false,
            toolPlan: "knowledge",
            topicShift: false,
            intent: "knowledge_query",
            source: "model",
          }),
        },
        assistant: {
          replyWithDebug: vi.fn(),
        },
        externalKnowledge: {
          askStream: vi.fn().mockResolvedValue(
            new Response(
              [
                'data: {"type":"chunk","content":"{{图1}}"}',
                "",
                'data: {"type":"done","sessionId":"rag-session-img","sources":[{"chunkId":3,"documentId":1,"title":"报销制度","chunkText":"流程图预览","score":0.91,"sourceUrl":"https://alidocs.dingtalk.com/i/nodes/xxx","imageUrl":"kb-images/1/2.png"}]}',
                "",
                "data: [DONE]",
                "",
              ].join("\n"),
              {
                headers: {
                  "Content-Type": "text/event-stream",
                },
              },
            ),
          ),
          getMappedSessionId: vi.fn().mockReturnValue(undefined),
          setMappedSessionId: vi.fn(),
        },
      }),
    }));

    const post = await importFreshRoute();
    const response = await post(
      new Request("http://localhost/api/dingtalk/webhook/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: "home-knowledge-image-1",
          text: {
            content: "报销流程是什么",
          },
        }),
      }),
    );

    const payload = await response.text();
    const events = readSseEvents(payload);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://rag.example.com/kb-images/1/2.png",
    );
    expect(events).toEqual([
      {
        type: "chunk",
        content: "{{图1}}",
      },
      {
        type: "done",
        reply: "{{图1}}",
        kind: "knowledge",
        citations: [
          {
            documentTitle: "报销制度",
            sourceUrl: "https://alidocs.dingtalk.com/i/nodes/xxx",
          },
        ],
        images: [
          {
            name: "图1",
            data: "iVBORw==",
            preview: "流程图预览",
          },
        ],
        meta: {
          title: "报销制度",
        },
      },
    ]);

    delete process.env.RAG_API_URL;
    vi.doUnmock("@/modules/assistant/create-assistant-runtime");
  });

  it("falls back to sync ask pics when streamed sources do not yield a usable image", async () => {
    const ask = vi.fn().mockResolvedValue({
      sessionId: "rag-session-pics",
      answer: "报销流程如下：{{图1}}",
      source: ["https://alidocs.dingtalk.com/i/nodes/xxx"],
      pics: [
        {
          name: "图1",
          data: "base64-from-ask",
          preview: "同步问答返回的流程图",
        },
      ],
    });

    vi.doMock("@/modules/assistant/create-assistant-runtime", () => ({
      createAssistantRuntime: () => ({
        analyzer: {
          analyze: vi.fn().mockResolvedValue({
            mode: "internal_knowledge",
            intentConfidence: 0.94,
            needKnowledge: true,
            needTaskResolution: false,
            toolPlan: "knowledge",
            topicShift: false,
            intent: "knowledge_query",
            source: "model",
          }),
        },
        assistant: {
          replyWithDebug: vi.fn(),
        },
        externalKnowledge: {
          ask,
          askStream: vi.fn().mockResolvedValue(
            new Response(
              [
                'data: {"type":"chunk","content":"报销流程如下：{{图1}}"}',
                "",
                'data: {"type":"done","sessionId":"rag-session-pics","sources":[{"chunkId":3,"documentId":1,"title":"报销制度","chunkText":"流程图预览","score":0.91,"sourceUrl":"https://alidocs.dingtalk.com/i/nodes/xxx","imageUrl":"kb-images/1/404.png"}]}',
                "",
                "data: [DONE]",
                "",
              ].join("\n"),
              {
                headers: {
                  "Content-Type": "text/event-stream",
                },
              },
            ),
          ),
          getMappedSessionId: vi.fn().mockReturnValue(undefined),
          setMappedSessionId: vi.fn(),
        },
      }),
    }));

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not found", {
        status: 404,
      }),
    );

    const post = await importFreshRoute();
    const response = await post(
      new Request("http://localhost/api/dingtalk/webhook/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: "home-knowledge-pics-1",
          senderId: "user-1",
          text: {
            content: "报销流程是什么",
          },
        }),
      }),
    );

    const payload = await response.text();
    const events = readSseEvents(payload);

    expect(ask).toHaveBeenCalledWith({
      question: "报销流程是什么",
      operatorId: "user-1",
      maxSources: 5,
      excludeImageData: false,
    });
    expect(events).toEqual([
      {
        type: "chunk",
        content: "报销流程如下：{{图1}}",
      },
      {
        type: "done",
        reply: "报销流程如下：{{图1}}",
        kind: "knowledge",
        citations: [
          {
            documentTitle: "报销制度",
            sourceUrl: "https://alidocs.dingtalk.com/i/nodes/xxx",
          },
        ],
        images: [
          {
            name: "图1",
            data: "base64-from-ask",
            preview: "同步问答返回的流程图",
          },
        ],
        meta: {
          title: "报销制度",
        },
      },
    ]);

    vi.doUnmock("@/modules/assistant/create-assistant-runtime");
  });

  it("keeps the knowledge reply successful when done sources have no images and sync ask pics are empty", async () => {
    const ask = vi.fn().mockResolvedValue({
      sessionId: "rag-session-no-image",
      answer: "迟到是否扣钱取决于迟到时间。",
      source: [
        "https://alidocs.dingtalk.com/i/nodes/ydxXB52LJqe7j5PATQOZGldZJqjMp697",
      ],
      pics: [],
    });

    vi.doMock("@/modules/assistant/create-assistant-runtime", () => ({
      createAssistantRuntime: () => ({
        analyzer: {
          analyze: vi.fn().mockResolvedValue({
            mode: "internal_knowledge",
            intentConfidence: 0.94,
            needKnowledge: true,
            needTaskResolution: false,
            toolPlan: "knowledge",
            topicShift: false,
            intent: "knowledge_query",
            source: "model",
          }),
        },
        assistant: {
          replyWithDebug: vi.fn(),
        },
        externalKnowledge: {
          ask,
          askStream: vi.fn().mockResolvedValue(
            new Response(
              [
                'data: {"type":"chunk","content":"迟到是否扣钱取决于迟到时间。"}',
                "",
                'data: {"type":"done","sessionId":"rag-session-no-image","sources":[{"chunkId":3,"documentId":1,"title":"考勤制度","chunkText":"迟到是否扣钱取决于迟到时间。","score":0.91,"sourceUrl":"https://alidocs.dingtalk.com/i/nodes/ydxXB52LJqe7j5PATQOZGldZJqjMp697"}]}',
                "",
                "data: [DONE]",
                "",
              ].join("\n"),
              {
                headers: {
                  "Content-Type": "text/event-stream",
                },
              },
            ),
          ),
          getMappedSessionId: vi.fn().mockReturnValue(undefined),
          setMappedSessionId: vi.fn(),
        },
      }),
    }));

    const post = await importFreshRoute();
    const response = await post(
      new Request("http://localhost/api/dingtalk/webhook/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: "home-knowledge-no-image-1",
          senderId: "user-1",
          text: {
            content: "迟到扣钱吗",
          },
        }),
      }),
    );

    const payload = await response.text();
    const events = readSseEvents(payload);

    expect(events).toEqual([
      {
        type: "chunk",
        content: "迟到是否扣钱取决于迟到时间。",
      },
      {
        type: "done",
        reply: "迟到是否扣钱取决于迟到时间。",
        kind: "knowledge",
        citations: [
          {
            documentTitle: "考勤制度",
            sourceUrl:
              "https://alidocs.dingtalk.com/i/nodes/ydxXB52LJqe7j5PATQOZGldZJqjMp697",
          },
        ],
        meta: {
          title: "考勤制度",
        },
      },
    ]);

    vi.doUnmock("@/modules/assistant/create-assistant-runtime");
  });

  it("does not call sync ask image fallback when the reply has no image placeholder or image sources", async () => {
    const ask = vi.fn();

    vi.doMock("@/modules/assistant/create-assistant-runtime", () => ({
      createAssistantRuntime: () => ({
        analyzer: {
          analyze: vi.fn().mockResolvedValue({
            mode: "internal_knowledge",
            intentConfidence: 0.94,
            needKnowledge: true,
            needTaskResolution: false,
            toolPlan: "knowledge",
            topicShift: false,
            intent: "knowledge_query",
            source: "model",
          }),
        },
        assistant: {
          replyWithDebug: vi.fn(),
        },
        externalKnowledge: {
          ask,
          askStream: vi.fn().mockResolvedValue(
            new Response(
              [
                'data: {"type":"chunk","content":"公司规章制度包括员工行为规范和福利制度。"}',
                "",
                'data: {"type":"done","sessionId":"rag-session-no-fallback","sources":[{"chunkId":3,"documentId":1,"title":"员工行为规范","chunkText":"员工行为规范条例","score":0.91,"sourceUrl":"https://alidocs.dingtalk.com/i/nodes/rules"}]}',
                "",
                "data: [DONE]",
                "",
              ].join("\n"),
              {
                headers: {
                  "Content-Type": "text/event-stream",
                },
              },
            ),
          ),
          getMappedSessionId: vi.fn().mockReturnValue(undefined),
          setMappedSessionId: vi.fn(),
        },
      }),
    }));

    const post = await importFreshRoute();
    const response = await post(
      new Request("http://localhost/api/dingtalk/webhook/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: "home-knowledge-no-fallback-1",
          senderId: "user-1",
          text: {
            content: "公司规章制度是什么",
          },
        }),
      }),
    );

    const payload = await response.text();
    const events = readSseEvents(payload);

    expect(ask).not.toHaveBeenCalled();
    expect(events).toEqual([
      {
        type: "chunk",
        content: "公司规章制度包括员工行为规范和福利制度。",
      },
      {
        type: "done",
        reply: "公司规章制度包括员工行为规范和福利制度。",
        kind: "knowledge",
        citations: [
          {
            documentTitle: "员工行为规范",
            sourceUrl: "https://alidocs.dingtalk.com/i/nodes/rules",
          },
        ],
        meta: {
          title: "员工行为规范",
        },
      },
    ]);

    vi.doUnmock("@/modules/assistant/create-assistant-runtime");
  });

  it("falls back to a synthetic stream when the request is not knowledge", async () => {
    vi.doMock("@/modules/assistant/create-assistant-runtime", () => ({
      createAssistantRuntime: () => ({
        analyzer: {
          analyze: vi.fn().mockResolvedValue({
            mode: "task",
            intentConfidence: 0.91,
            needKnowledge: false,
            needTaskResolution: true,
            toolPlan: "task",
            topicShift: false,
            intent: "task_request",
            source: "model",
          }),
        },
        assistant: {
          replyWithDebug: vi.fn().mockResolvedValue({
            reply: "已为你打开 OA 入口。",
            conversationContext: [],
            intent: {
              mode: "task",
              intentConfidence: 0.91,
              needKnowledge: false,
              needTaskResolution: true,
              toolPlan: "task",
              topicShift: false,
              intent: "task_request",
              source: "model",
            },
            resolution: {
              kind: "task",
              intent: "task_request",
              title: "OA 入口",
              entry: "https://oa.example.com",
              guidance: "请按入口提示继续办理",
            },
            usedResponseGenerator: false,
          }),
        },
      }),
    }));

    const post = await importFreshRoute();
    const response = await post(
      new Request("http://localhost/api/dingtalk/webhook/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: "home-task-1",
          entryMode: "task",
          text: {
            content: "帮我打开 OA",
          },
        }),
      }),
    );

    const payload = await response.text();
    const events = readSseEvents(payload);

    expect(response.status).toBe(200);
    expect(events).toEqual([
      {
        type: "chunk",
        content: "已为你打开 OA 入口。",
      },
      {
        type: "done",
        reply: "已为你打开 OA 入口。",
        kind: "task",
        meta: {
          title: "OA 入口",
          entry: "https://oa.example.com",
        },
      },
    ]);

    vi.doUnmock("@/modules/assistant/create-assistant-runtime");
  });

  it("falls back to the sync assistant reply when external knowledge streaming fails", async () => {
    vi.doMock("@/modules/assistant/create-assistant-runtime", () => ({
      createAssistantRuntime: () => ({
        analyzer: {
          analyze: vi.fn().mockResolvedValue({
            mode: "internal_knowledge",
            intentConfidence: 0.95,
            needKnowledge: true,
            needTaskResolution: false,
            toolPlan: "knowledge",
            topicShift: false,
            intent: "knowledge_query",
            source: "model",
          }),
        },
        assistant: {
          replyWithDebug: vi.fn().mockResolvedValue({
            reply: "这是同步兜底回答。",
            conversationContext: [],
            intent: {
              mode: "internal_knowledge",
              intentConfidence: 0.95,
              needKnowledge: true,
              needTaskResolution: false,
              toolPlan: "knowledge",
              topicShift: false,
              intent: "knowledge_query",
              source: "model",
            },
            resolution: {
              kind: "knowledge",
              intent: "knowledge_query",
              title: "费用报销制度",
              answer: "这是同步兜底回答。",
              citations: [
                {
                  documentTitle: "费用报销制度",
                  sourceUrl: "https://alidocs.dingtalk.com/i/nodes/fallback",
                },
              ],
            },
            usedResponseGenerator: false,
          }),
        },
        externalKnowledge: {
          askStream: vi.fn().mockRejectedValue(new Error("stream boom")),
          getMappedSessionId: vi.fn().mockReturnValue(undefined),
          setMappedSessionId: vi.fn(),
        },
      }),
    }));

    const post = await importFreshRoute();
    const response = await post(
      new Request("http://localhost/api/dingtalk/webhook/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: "home-knowledge-fallback-1",
          text: {
            content: "报销流程是什么",
          },
        }),
      }),
    );

    const payload = await response.text();
    const events = readSseEvents(payload);

    expect(response.status).toBe(200);
    expect(events).toEqual([
      {
        type: "chunk",
        content: "这是同步兜底回答。",
      },
      {
        type: "done",
        reply: "这是同步兜底回答。",
        kind: "knowledge",
        citations: [
          {
            documentTitle: "费用报销制度",
            sourceUrl: "https://alidocs.dingtalk.com/i/nodes/fallback",
          },
        ],
        meta: {
          title: "费用报销制度",
        },
      },
    ]);

    vi.doUnmock("@/modules/assistant/create-assistant-runtime");
  });
});
