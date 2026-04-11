import type { AssistantDebugReply } from "@/modules/assistant/assistant.service";
import { resolveUserQuery } from "@/modules/assistant/user-query";
import type {
  KnowledgeCitation,
  KnowledgeImage,
} from "@/modules/knowledge/retriever.types";

type StreamTextPayload = {
  text?: {
    content?: string;
  };
  imageUrl?: string;
  imageUrls?: string[];
};

type StreamMessagePayload = StreamTextPayload & {
  sessionWebhook?: string;
  conversationId?: string;
  senderStaffId?: string;
  senderId?: string;
};

type AssistantPort = {
  reply(input: {
    query: string;
    sessionId?: string;
    userId?: string;
    imageUrl?: string;
    imageUrls?: string[];
  }): Promise<string>;
  replyWithDebug?: (
    input: {
      query: string;
      sessionId?: string;
      userId?: string;
      imageUrl?: string;
      imageUrls?: string[];
    }
  ) => Promise<AssistantDebugReply>;
};

type StreamReplyPort = {
  replyMarkdown(
    sessionWebhook: string,
    text: string,
    options?: {
      citations?: KnowledgeCitation[];
      images?: KnowledgeImage[];
    },
  ): Promise<void>;
};

type StreamHandlerResult =
  | {
      success: true;
      retryable: false;
    }
  | {
      success: false;
      retryable: boolean;
      reason: string;
    };

export function extractIncomingText(payload: StreamTextPayload) {
  const message = resolveUserQuery({
    text: payload.text?.content,
    imageUrl: payload.imageUrl,
    imageUrls: payload.imageUrls,
  });

  return message ? message : null;
}

export function createDingTalkStreamHandler(input: {
  assistant: AssistantPort;
  replier: StreamReplyPort;
}) {
  // 这一层只负责把钉钉消息转成“assistant 输入 -> 回复输出”的统一流程。
  return async function handleIncomingMessage(
    payload: StreamMessagePayload
  ): Promise<StreamHandlerResult> {
    const message = extractIncomingText(payload);

    if (!message) {
      return {
        success: false,
        retryable: false,
        reason: "empty message"
      };
    }

    if (!payload.sessionWebhook) {
      return {
        success: false,
        retryable: false,
        reason: "missing session webhook"
      };
    }

    // sessionWebhook 是只用于一次性回复的钉钉接口，而 conversationId 才是真实的会话上下文 ID
    const assistantInput = {
      query: message,
      sessionId: payload.conversationId || payload.sessionWebhook,
      userId: payload.senderStaffId || payload.senderId,
      imageUrl: payload.imageUrl,
      imageUrls: payload.imageUrls,
    };
    let reply: string;
    let citations: KnowledgeCitation[] | undefined;
    let images: KnowledgeImage[] | undefined;

    if (input.assistant.replyWithDebug) {
      const debugResult = await input.assistant.replyWithDebug(assistantInput);
      reply = debugResult.reply;
      if (debugResult.resolution.kind === "knowledge") {
        citations = debugResult.resolution.citations;
        images = debugResult.resolution.images;
      }
    } else {
      reply = await input.assistant.reply(assistantInput);
    }

    if ((citations && citations.length > 0) || (images && images.length > 0)) {
      await input.replier.replyMarkdown(payload.sessionWebhook, reply, {
        citations,
        images,
      });
    } else {
      await input.replier.replyMarkdown(payload.sessionWebhook, reply);
    }

    return {
      success: true,
      retryable: false
    };
  };
}
