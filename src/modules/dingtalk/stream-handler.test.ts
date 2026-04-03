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

    expect(assistant.reply).toHaveBeenCalledWith({
      query: "补卡流程是什么",
      sessionId: "https://session.example.com"
    });
    expect(replyMarkdown).toHaveBeenCalledWith(
      "https://session.example.com",
      "结论\n进入审批后发起补卡申请。"
    );
    expect(result.success).toBe(true);
    expect(result.retryable).toBe(false);
  });

  it("passes knowledge images to the replier when debug resolution includes cited pictures", async () => {
    const replyMarkdown = vi.fn(async () => undefined);
    const assistant = {
      reply: vi.fn(async () => "不会被调用"),
      replyWithDebug: vi.fn(async () => ({
        reply: "公司的报销流程如下，详见{{图1}}。",
        conversationContext: [],
        intent: {
          mode: "internal_knowledge",
          intentConfidence: 0.9,
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
          answer: "公司的报销流程如下，详见{{图1}}。",
          citations: [
            {
              documentTitle: "沐腾费用报销流程及须知事项20260310",
              sourceUrl:
                "https://alidocs.dingtalk.com/i/nodes/ydxXB52LJqe7j5PATQOZGldZJqjMp697",
            },
          ],
          images: [
            {
              name: "图1",
              data: "base64-image",
              preview: "报销流程示意图",
            },
          ],
        },
        usedResponseGenerator: false,
      })),
    };

    const handler = createDingTalkStreamHandler({
      assistant,
      replier: {
        replyMarkdown,
      },
    });

    const result = await handler({
      sessionWebhook: "https://session.example.com",
      text: {
        content: "报销流程是什么",
      },
    });

    expect(assistant.replyWithDebug).toHaveBeenCalledWith({
      query: "报销流程是什么",
      sessionId: "https://session.example.com",
      userId: undefined,
    });
    expect(replyMarkdown).toHaveBeenCalledWith(
      "https://session.example.com",
      "公司的报销流程如下，详见{{图1}}。",
      {
        citations: [
          {
            documentTitle: "沐腾费用报销流程及须知事项20260310",
            sourceUrl:
              "https://alidocs.dingtalk.com/i/nodes/ydxXB52LJqe7j5PATQOZGldZJqjMp697",
          },
        ],
        images: [
          {
            name: "图1",
            data: "base64-image",
            preview: "报销流程示意图",
          },
        ],
      },
    );
    expect(result.success).toBe(true);
    expect(result.retryable).toBe(false);
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
    expect(result.retryable).toBe(false);
    if (!result.success) {
      expect(result.reason).toContain("empty");
    }
  });

  it("marks missing session webhook as a non-retryable validation failure", async () => {
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
      text: {
        content: "我要请假"
      }
    });

    expect(assistant.reply).not.toHaveBeenCalled();
    expect(replyMarkdown).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.retryable).toBe(false);
    if (!result.success) {
      expect(result.reason).toContain("missing session webhook");
    }
  });
});
