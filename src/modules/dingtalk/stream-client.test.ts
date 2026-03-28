import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockDwClientInstances: MockDWClient[] = [];

vi.mock("dingtalk-stream", () => ({
  DWClient: class {
    public readonly registerCallbackListener = vi.fn();
    public readonly socketCallBackResponse = vi.fn();

    constructor(public readonly options: Record<string, unknown>) {
      mockDwClientInstances.push(this as MockDWClient);
    }
  },
  EventAck: {
    SUCCESS: "SUCCESS",
    LATER: "LATER"
  },
  TOPIC_ROBOT: "TOPIC_ROBOT"
}));

type MockDWClient = {
  registerCallbackListener: ReturnType<typeof vi.fn>;
  socketCallBackResponse: ReturnType<typeof vi.fn>;
  options: Record<string, unknown>;
};

import {
  createDingTalkStreamClient,
  createRobotStreamListener,
  createSessionWebhookReplier
} from "./stream-client";

function buildDecisionPayload(query: string) {
  if (query.includes("请假")) {
    return {
      mode: "task",
      intentConfidence: 0.94,
      needKnowledge: false,
      needTaskResolution: true,
      topicShift: false,
      taskHint: "leave_application"
    };
  }

  return {
    mode: "knowledge",
    intentConfidence: 0.93,
    needKnowledge: true,
    needTaskResolution: false,
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

function installModelEnabledFetchMock() {
  process.env.SILICONFLOW_API_KEY = "test-key";
  process.env.SILICONFLOW_BASE_URL = "https://api.siliconflow.cn/v1";
  process.env.SILICONFLOW_MODEL = "Qwen/Qwen3-8B";

  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);

    if (url.endsWith("/chat/completions")) {
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
    }

    return new Response(null, { status: 200 });
  });
}

function createStreamHeaders(messageId: string) {
  return {
    appId: "app-1",
    connectionId: "conn-1",
    contentType: "application/json",
    messageId,
    time: new Date().toISOString(),
    topic: "TOPIC_ROBOT"
  };
}

beforeEach(() => {
  mockDwClientInstances.length = 0;
});

afterEach(() => {
  delete process.env.SILICONFLOW_API_KEY;
  delete process.env.SILICONFLOW_BASE_URL;
  delete process.env.SILICONFLOW_MODEL;
  vi.restoreAllMocks();
});

describe("createSessionWebhookReplier", () => {
  it("posts the assistant reply to the DingTalk session webhook", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    const replier = createSessionWebhookReplier(fetchMock as typeof fetch);

    await replier.replyMarkdown(
      "https://session.example.com",
      "结论\n进入审批后发起补卡申请。"
    );

    expect(fetchMock).toHaveBeenCalledWith("https://session.example.com", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        msgtype: "text",
        text: {
          content: "结论\n进入审批后发起补卡申请。"
        }
      })
    });
  });
});

describe("createRobotStreamListener", () => {
  it("acks success after handling a valid robot message", async () => {
    const socketCallBackResponse = vi.fn();
    const assistant = {
      reply: vi.fn(async () => "结论\n进入审批后发起补卡申请。")
    };
    const replier = {
      replyMarkdown: vi.fn(async () => undefined)
    };

    const listener = createRobotStreamListener({
      client: {
        socketCallBackResponse
      },
      assistant,
      replier
    });

    await listener({
      headers: createStreamHeaders("msg-1"),
      data: JSON.stringify({
        sessionWebhook: "https://session.example.com",
        text: {
          content: "补卡流程是什么"
        }
      })
    });

    expect(assistant.reply).toHaveBeenCalledWith({
      query: "补卡流程是什么",
      sessionId: "https://session.example.com"
    });
    expect(replier.replyMarkdown).toHaveBeenCalled();
    expect(socketCallBackResponse).toHaveBeenCalledWith("msg-1", "SUCCESS");
  });

  it("acks later when the assistant processing throws", async () => {
    const socketCallBackResponse = vi.fn();
    const assistant = {
      reply: vi.fn(async () => {
        throw new Error("assistant failed");
      })
    };
    const replier = {
      replyMarkdown: vi.fn(async () => undefined)
    };

    const listener = createRobotStreamListener({
      client: {
        socketCallBackResponse
      },
      assistant,
      replier
    });

    await listener({
      headers: createStreamHeaders("msg-2"),
      data: JSON.stringify({
        sessionWebhook: "https://session.example.com",
        text: {
          content: "补卡流程是什么"
        }
      })
    });

    expect(socketCallBackResponse).toHaveBeenCalledWith("msg-2", {
      status: "LATER",
      message: "assistant failed"
    });
  });

  it("acks success when the handler reports an empty message", async () => {
    const socketCallBackResponse = vi.fn();
    const assistant = {
      reply: vi.fn(async () => "不会被调用")
    };
    const replier = {
      replyMarkdown: vi.fn(async () => undefined)
    };

    const listener = createRobotStreamListener({
      client: {
        socketCallBackResponse
      },
      assistant,
      replier
    });

    await listener({
      headers: createStreamHeaders("msg-empty"),
      data: JSON.stringify({
        sessionWebhook: "https://session.example.com",
        text: {
          content: "   "
        }
      })
    });

    expect(assistant.reply).not.toHaveBeenCalled();
    expect(replier.replyMarkdown).not.toHaveBeenCalled();
    expect(socketCallBackResponse).toHaveBeenCalledWith("msg-empty", "SUCCESS");
  });

  it("acks success when the handler reports a missing session webhook", async () => {
    const socketCallBackResponse = vi.fn();
    const assistant = {
      reply: vi.fn(async () => "不会被调用")
    };
    const replier = {
      replyMarkdown: vi.fn(async () => undefined)
    };

    const listener = createRobotStreamListener({
      client: {
        socketCallBackResponse
      },
      assistant,
      replier
    });

    await listener({
      headers: createStreamHeaders("msg-no-webhook"),
      data: JSON.stringify({
        text: {
          content: "我要请假"
        }
      })
    });

    expect(assistant.reply).not.toHaveBeenCalled();
    expect(replier.replyMarkdown).not.toHaveBeenCalled();
    expect(socketCallBackResponse).toHaveBeenCalledWith(
      "msg-no-webhook",
      "SUCCESS"
    );
  });
});

describe("createAssistantRuntime", () => {
  it("does not rely on parseAppEnv for runtime-only config", async () => {
    vi.resetModules();
    vi.doMock("@/config/env", () => ({
      parseAppEnv: vi.fn(() => {
        throw new Error("parseAppEnv should not be called");
      })
    }));

    const { createAssistantRuntime } = await import(
      "@/modules/assistant/create-assistant-runtime"
    );

    expect(() => createAssistantRuntime({ env: {} })).not.toThrow();
  });
});

describe("createDingTalkStreamClient", () => {
  it("uses the shared default runtime to answer task requests", async () => {
    const fetchSpy = installModelEnabledFetchMock();

    createDingTalkStreamClient({
      clientId: "client-id",
      clientSecret: "client-secret"
    });
    const registeredListener = mockDwClientInstances[0]?.registerCallbackListener.mock
      .calls[0]?.[1];

    await registeredListener?.({
      headers: createStreamHeaders("msg-3"),
      data: JSON.stringify({
        sessionWebhook: "https://session.example.com",
        text: {
          content: "我要请假"
        }
      })
    });

    expect(mockDwClientInstances[0]?.registerCallbackListener).toHaveBeenCalledWith(
      "TOPIC_ROBOT",
      expect.any(Function)
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://session.example.com",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("leave-application")
      })
    );
  });

  it("uses the shared default runtime to answer knowledge requests", async () => {
    const fetchSpy = installModelEnabledFetchMock();

    createDingTalkStreamClient({
      clientId: "client-id",
      clientSecret: "client-secret"
    });

    const registeredListener = mockDwClientInstances[0]?.registerCallbackListener.mock
      .calls[0]?.[1];

    await registeredListener?.({
      headers: createStreamHeaders("msg-4"),
      data: JSON.stringify({
        sessionWebhook: "https://session.example.com",
        text: {
          content: "年假规则是什么"
        }
      })
    });

    expect(mockDwClientInstances[0]?.socketCallBackResponse).toHaveBeenCalledWith(
      "msg-4",
      "SUCCESS"
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://session.example.com",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("年假天数按司龄计算")
      })
    );
  });
});
