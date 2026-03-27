import { describe, expect, it, vi } from "vitest";

import {
  createDingTalkStreamHandler,
  extractIncomingText
} from "./stream-handler";

describe("extractIncomingText", () => {
  it("returns the trimmed text content from a stream payload", () => {
    expect(
      extractIncomingText({
        text: {
          content: "  补卡流程是什么  "
        }
      })
    ).toBe("补卡流程是什么");
  });

  it("returns null when the payload does not contain a usable text message", () => {
    expect(
      extractIncomingText({
        text: {
          content: "   "
        }
      })
    ).toBeNull();
  });
});

describe("createDingTalkStreamHandler", () => {
  it("uses the assistant service reply and sends it to the session webhook", async () => {
    const replyMarkdown = vi.fn(async () => undefined);
    const assistant = {
      reply: vi.fn(async () => "结论\n进入审批后发起补卡申请。")
    };

    const handler = createDingTalkStreamHandler({
      assistant,
      replier: {
        replyMarkdown
      }
    });

    const result = await handler({
      sessionWebhook: "https://session.example.com",
      text: {
        content: "补卡流程是什么"
      }
    });

    expect(assistant.reply).toHaveBeenCalledWith("补卡流程是什么");
    expect(replyMarkdown).toHaveBeenCalledWith(
      "https://session.example.com",
      "结论\n进入审批后发起补卡申请。"
    );
    expect(result.success).toBe(true);
  });

  it("skips replying when the incoming message is empty", async () => {
    const replyMarkdown = vi.fn(async () => undefined);
    const assistant = {
      reply: vi.fn(async () => "不会被调用")
    };

    const handler = createDingTalkStreamHandler({
      assistant,
      replier: {
        replyMarkdown
      }
    });

    const result = await handler({
      sessionWebhook: "https://session.example.com",
      text: {
        content: "   "
      }
    });

    expect(assistant.reply).not.toHaveBeenCalled();
    expect(replyMarkdown).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.reason).toContain("empty");
  });
});
