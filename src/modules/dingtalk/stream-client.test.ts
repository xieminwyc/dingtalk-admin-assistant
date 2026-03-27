import { describe, expect, it, vi } from "vitest";

import {
  createRobotStreamListener,
  createSessionWebhookReplier
} from "./stream-client";

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
      headers: {
        messageId: "msg-1"
      },
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
      headers: {
        messageId: "msg-2"
      },
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
});
