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

    expect(assistant.reply).toHaveBeenCalledWith("补卡流程是什么");
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
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(null, { status: 200 }));

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
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(null, { status: 200 }));

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
