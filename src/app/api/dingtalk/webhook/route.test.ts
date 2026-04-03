import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function importFreshRoute() {
  vi.resetModules();
  const routeModule = await import("./route");
  return routeModule.POST;
}

function buildDecisionPayload(query: string) {
  if (query.includes("你好")) {
    return {
      mode: "open_response",
      intentConfidence: 0.98,
      needKnowledge: false,
      needTaskResolution: false,
      toolPlan: "none",
      topicShift: false,
      reply: "你好，我是你的员工助手。你可以问我制度规则、办理入口，或者直接告诉我你想办什么。"
    };
  }

  if (query.includes("请假")) {
    return {
      mode: "task",
      intentConfidence: 0.94,
      needKnowledge: false,
      needTaskResolution: true,
      toolPlan: "task",
      topicShift: false,
      taskHint: "leave_application"
    };
  }

  return {
    mode: "internal_knowledge",
    intentConfidence: 0.93,
    needKnowledge: true,
    needTaskResolution: false,
    toolPlan: "knowledge",
    topicShift: false,
    knowledgeHint: "年假规则"
  };
}

function buildGeneratedReply(query: string) {
  if (query.includes("请假")) {
    return "事务入口\nhttps://oa.example.com/tasks/leave-application\n\n操作指引\n请按入口提示继续办理";
  }

  return "结论\n年假天数按司龄计算，试用期不单独享有年假，具体以 HR 制度公告为准。\n\n适用范围\n适用于正式员工年假政策查询";
}

describe("POST /api/dingtalk/webhook", () => {
  beforeEach(() => {
    process.env.SILICONFLOW_API_KEY = "test-key";
    process.env.SILICONFLOW_BASE_URL = "https://api.siliconflow.cn/v1";
    process.env.SILICONFLOW_MODEL = "Qwen/Qwen3-8B";

    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const requestBody = JSON.parse(String(init?.body ?? "{}")) as {
        messages?: Array<{ content?: string }>;
      };
      const query =
        requestBody.messages?.[1]?.content?.split("当前用户消息：")[1]?.trim() ?? "";
      const systemPrompt = requestBody.messages?.[0]?.content ?? "";

      if (String(systemPrompt).includes("回复生成器")) {
        return Response.json({
          choices: [
            {
              message: {
                content: buildGeneratedReply(query)
              }
            }
          ]
        });
      }

      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify(buildDecisionPayload(query))
            }
          }
        ]
      });
    });
  });

  afterEach(() => {
    delete process.env.SILICONFLOW_API_KEY;
    delete process.env.SILICONFLOW_BASE_URL;
    delete process.env.SILICONFLOW_MODEL;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("returns a task entry reply for a transactional request", async () => {
    const request = new Request("http://localhost/api/dingtalk/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: {
          content: "我要请假"
        }
      })
    });

    const post = await importFreshRoute();
    const response = await post(request);
    const data = (await response.json()) as {
      reply?: string;
    };

    expect(response.status).toBe(200);
    expect(data.reply).toContain("事务入口");
    expect(data.reply).toContain("https://oa.example.com/tasks/leave-application");
  });

  it("returns a knowledge reply for a knowledge request", async () => {
    const request = new Request("http://localhost/api/dingtalk/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: {
          content: "年假规则是什么"
        }
      })
    });

    const post = await importFreshRoute();
    const response = await post(request);
    const data = (await response.json()) as {
      reply?: string;
    };

    expect(response.status).toBe(200);
    expect(data.reply).toContain("结论");
    expect(data.reply).toContain("满 1 年不满 10 年为 5 天");
  });

  it("can return debug payloads for the web debug page", async () => {
    const request = new Request("http://localhost/api/dingtalk/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        debug: true,
        sessionId: "page-debug-session",
        text: {
          content: "年假规则是什么"
        }
      })
    });

    const post = await importFreshRoute();
    const response = await post(request);
    const data = (await response.json()) as {
      reply?: string;
      debug?: {
        intent?: {
          mode?: string;
          knowledgeHint?: string;
          source?: string;
        };
        resolution?: {
          kind?: string;
          referenceLabel?: string;
        };
        usedResponseGenerator?: boolean;
      };
    };

    expect(response.status).toBe(200);
    expect(data.reply).toContain("满 1 年不满 10 年为 5 天");
    expect(data.debug?.intent?.mode).toBe("internal_knowledge");
    expect(data.debug?.intent?.knowledgeHint).toBe("年假规则");
    expect(data.debug?.resolution?.kind).toBe("knowledge");
    expect(data.debug?.usedResponseGenerator).toBe(false);
    expect(data.debug).toEqual(
      expect.objectContaining({
        intent: expect.any(Object),
        resolution: expect.any(Object),
        usedResponseGenerator: expect.any(Boolean)
      })
    );
  });

  it("returns a direct open_response debug payload without a second model call", async () => {
    vi.resetModules();
    vi.restoreAllMocks();

    process.env.SILICONFLOW_API_KEY = "test-key";
    process.env.SILICONFLOW_BASE_URL = "https://api.siliconflow.cn/v1";
    process.env.SILICONFLOW_MODEL = "Qwen/Qwen3-8B";

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const requestBody = JSON.parse(String(init?.body ?? "{}")) as {
        messages?: Array<{ content?: string }>;
      };
      const query =
        requestBody.messages?.[1]?.content?.split("当前用户消息：")[1]?.trim() ?? "";
      const systemPrompt = requestBody.messages?.[0]?.content ?? "";

      if (String(systemPrompt).includes("回复生成器")) {
        throw new Error("response generator should not be called for direct open_response");
      }

      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify(buildDecisionPayload(query))
            }
          }
        ]
      });
    });

    const { POST: freshPost } = await import("./route");
    const request = new Request("http://localhost/api/dingtalk/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        debug: true,
        sessionId: "page-debug-open-response",
        text: {
          content: "你好"
        }
      })
    });

    const response = await freshPost(request);
    const data = (await response.json()) as {
      reply?: string;
      debug?: {
        intent?: {
          mode?: string;
        };
        resolution?: {
          kind?: string;
        };
        usedResponseGenerator?: boolean;
      };
    };

    expect(response.status).toBe(200);
    expect(data.reply).toContain("你好，我是你的员工助手");
    expect(data.debug?.intent?.mode).toBe("open_response");
    expect(data.debug?.resolution?.kind).toBe("open_response");
    expect(data.debug?.usedResponseGenerator).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects an empty user message", async () => {
    const request = new Request("http://localhost/api/dingtalk/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: {
          content: "   "
        }
      })
    });

    const post = await importFreshRoute();
    const response = await post(request);

    expect(response.status).toBe(400);
  });

  it("passes entryMode to the assistant runtime input", async () => {
    vi.resetModules();

    const reply = vi.fn();
    const replyWithDebug = vi.fn().mockResolvedValue({
      reply: "已为你打开 OA 入口。",
      conversationContext: [],
      intent: {
        mode: "task",
        intentConfidence: 0.9,
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
    });

    vi.doMock("@/modules/assistant/create-assistant-runtime", () => ({
      createAssistantRuntime: () => ({
        assistant: {
          reply,
          replyWithDebug
        }
      })
    }));

    const { POST: mockedPost } = await import("./route");
    const request = new Request("http://localhost/api/dingtalk/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        sessionId: "home-1",
        entryMode: "task",
        text: {
          content: "帮我打开 OA"
        }
      })
    });

    const response = await mockedPost(request);
    const data = (await response.json()) as {
      reply?: string;
    };

    expect(response.status).toBe(200);
    expect(data.reply).toBe("已为你打开 OA 入口。");
    expect(reply).not.toHaveBeenCalled();
    expect(replyWithDebug).toHaveBeenCalledWith({
      query: "帮我打开 OA",
      sessionId: "home-1",
      entryMode: "task"
    });

    vi.doUnmock("@/modules/assistant/create-assistant-runtime");
  });

  it("returns citations and images for knowledge replies when provided by the assistant runtime", async () => {
    vi.resetModules();

    const reply = vi.fn();
    const replyWithDebug = vi.fn().mockResolvedValue({
      reply: "公司的报销流程如下。",
      conversationContext: [],
      intent: {
        mode: "internal_knowledge",
        intentConfidence: 0.92,
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
        title: "报销流程",
        answer: "公司的报销流程如下。",
        source: "rag",
        citations: [
          {
            documentTitle: "钉钉文档 · xxx",
            sourceUrl: "https://alidocs.dingtalk.com/i/nodes/xxx",
          },
        ],
        images: [
          {
            name: "图1",
            data: "iVBORw0KGgoAAAANSUhEUgAAAAUA",
            preview: "报销流程示意图...",
          },
        ],
      },
      usedResponseGenerator: false,
    });

    vi.doMock("@/modules/assistant/create-assistant-runtime", () => ({
      createAssistantRuntime: () => ({
        assistant: {
          reply,
          replyWithDebug,
        },
      }),
    }));

    const { POST: mockedPost } = await import("./route");
    const request = new Request("http://localhost/api/dingtalk/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: "home-knowledge-1",
        text: {
          content: "报销流程是什么",
        },
      }),
    });

    const response = await mockedPost(request);
    const data = (await response.json()) as {
      citations?: Array<{ documentTitle: string; sourceUrl?: string }>;
      images?: Array<{ name: string; preview?: string; data?: string }>;
      kind?: string;
    };

    expect(response.status).toBe(200);
    expect(data.kind).toBe("knowledge");
    expect(data.citations).toEqual([
      {
        documentTitle: "钉钉文档 · xxx",
        sourceUrl: "https://alidocs.dingtalk.com/i/nodes/xxx",
      },
    ]);
    expect(data.images).toEqual([
      {
        name: "图1",
        data: "iVBORw0KGgoAAAANSUhEUgAAAAUA",
        preview: "报销流程示意图...",
      },
    ]);

    vi.doUnmock("@/modules/assistant/create-assistant-runtime");
  });

  it("includes the raw external rag ask response in debug payloads when available", async () => {
    vi.resetModules();

    const reply = vi.fn();
    const replyWithDebug = vi.fn().mockResolvedValue({
      reply: "公司的报销流程如下。",
      conversationContext: [],
      intent: {
        mode: "internal_knowledge",
        intentConfidence: 0.92,
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
        title: "钉钉文档 · ydxXB52LJqe7j5PATQOZGldZJqjMp697",
        answer: "公司的报销流程如下。",
        source: "rag",
        citations: [
          {
            documentTitle: "钉钉文档 · ydxXB52LJqe7j5PATQOZGldZJqjMp697",
            sourceUrl: "https://alidocs.dingtalk.com/i/nodes/ydxXB52LJqe7j5PATQOZGldZJqjMp697",
          },
        ],
        providerMeta: {
          ragAskResponse: {
            sessionId: "rag-session-9",
            answer: "公司的报销流程如下。",
            source: [
              "https://alidocs.dingtalk.com/i/nodes/ydxXB52LJqe7j5PATQOZGldZJqjMp697",
            ],
            pics: [
              {
                name: "图1",
                data: "base64-image",
                preview: "报销流程示意图",
              },
            ],
          },
        },
      },
      usedResponseGenerator: false,
    });

    vi.doMock("@/modules/assistant/create-assistant-runtime", () => ({
      createAssistantRuntime: () => ({
        assistant: {
          reply,
          replyWithDebug,
        },
      }),
    }));

    const { POST: mockedPost } = await import("./route");
    const request = new Request("http://localhost/api/dingtalk/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        debug: true,
        sessionId: "home-knowledge-debug-1",
        text: {
          content: "报销流程是什么",
        },
      }),
    });

    const response = await mockedPost(request);
    const data = (await response.json()) as {
      debug?: {
        externalRag?: {
          askResponse?: {
            sessionId?: string;
            answer?: string;
            source?: string[];
          };
        };
      };
      meta?: {
        title?: string;
      };
    };

    expect(response.status).toBe(200);
    expect(data.meta?.title).toBe(
      "钉钉文档 · ydxXB52LJqe7j5PATQOZGldZJqjMp697",
    );
    expect(data.debug?.externalRag?.askResponse).toEqual({
      sessionId: "rag-session-9",
      answer: "公司的报销流程如下。",
      source: [
        "https://alidocs.dingtalk.com/i/nodes/ydxXB52LJqe7j5PATQOZGldZJqjMp697",
      ],
      pics: [
        {
          name: "图1",
          data: "base64-image",
          preview: "报销流程示意图",
        },
      ],
    });

    vi.doUnmock("@/modules/assistant/create-assistant-runtime");
  });
});
