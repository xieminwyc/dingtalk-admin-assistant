type StreamTextPayload = {
  text?: {
    content?: string;
  };
};

type StreamMessagePayload = StreamTextPayload & {
  sessionWebhook?: string;
};

type AssistantPort = {
  reply(query: string): Promise<string>;
};

type StreamReplyPort = {
  replyMarkdown(sessionWebhook: string, text: string): Promise<void>;
};

export function extractIncomingText(payload: StreamTextPayload) {
  const message = payload.text?.content?.trim();

  return message ? message : null;
}

export function createDingTalkStreamHandler(input: {
  assistant: AssistantPort;
  replier: StreamReplyPort;
}) {
  // 这一层只负责把钉钉消息转成“assistant 输入 -> 回复输出”的统一流程。
  return async function handleIncomingMessage(payload: StreamMessagePayload) {
    const message = extractIncomingText(payload);

    if (!message) {
      return {
        success: false,
        reason: "empty message"
      };
    }

    if (!payload.sessionWebhook) {
      return {
        success: false,
        reason: "missing session webhook"
      };
    }

    // sessionWebhook 是每次会话级别的回复入口，直接拿它把 assistant 回复送回钉钉。
    const reply = await input.assistant.reply(message);
    await input.replier.replyMarkdown(payload.sessionWebhook, reply);

    return {
      success: true
    };
  };
}
