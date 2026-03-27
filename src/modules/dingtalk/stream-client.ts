import {
  DWClient,
  EventAck,
  TOPIC_ROBOT,
  type DWClientDownStream
} from "dingtalk-stream";

import { createAssistantService } from "@/modules/assistant/assistant.service";
import { FaqKnowledgeRetriever } from "@/modules/knowledge/faq-retriever";
import { sampleAdminFaq } from "@/modules/knowledge/sample-faq";
import { createDingTalkStreamHandler } from "./stream-handler";

type AssistantPort = {
  reply(query: string): Promise<string>;
};

type StreamReplyPort = {
  replyMarkdown(sessionWebhook: string, text: string): Promise<void>;
};

type SocketAckPort = {
  socketCallBackResponse(messageId: string, result: unknown): void;
};

type StreamRobotMessage = {
  sessionWebhook?: string;
  text?: {
    content?: string;
  };
};

export function createSessionWebhookReplier(
  fetchImpl: typeof fetch = fetch
): StreamReplyPort {
  return {
    async replyMarkdown(sessionWebhook: string, text: string) {
      // 当前先用 text 消息回发，后续如果需要卡片或 markdown，再在这里扩协议。
      const response = await fetchImpl(sessionWebhook, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          msgtype: "text",
          text: {
            content: text
          }
        })
      });

      if (!response.ok) {
        throw new Error(`session webhook request failed with ${response.status}`);
      }
    }
  };
}

export function createRobotStreamListener(input: {
  client: SocketAckPort;
  assistant: AssistantPort;
  replier?: StreamReplyPort;
}) {
  // Stream SDK 负责长连接；真正的业务处理继续复用我们自己的 assistant 逻辑。
  const handler = createDingTalkStreamHandler({
    assistant: input.assistant,
    replier: input.replier ?? createSessionWebhookReplier()
  });

  return async function onBotMessage(
    event: Pick<DWClientDownStream, "data" | "headers">
  ) {
    try {
      const message = JSON.parse(event.data) as StreamRobotMessage;

      await handler(message);
      // 处理成功后立即 ACK，避免钉钉重复投递同一条消息。
      input.client.socketCallBackResponse(event.headers.messageId, EventAck.SUCCESS);
    } catch (error) {
      input.client.socketCallBackResponse(event.headers.messageId, {
        status: EventAck.LATER,
        message: error instanceof Error ? error.message : "stream handler failed"
      });
    }
  };
}

export function createDingTalkStreamClient(input: {
  clientId: string;
  clientSecret: string;
  assistant?: AssistantPort;
  debug?: boolean;
}) {
  // 默认 assistant 先接内置 FAQ，后面接数据库或外部 RAG 时只替换这里的依赖。
  const assistant =
    input.assistant ??
    createAssistantService({
      retriever: new FaqKnowledgeRetriever(sampleAdminFaq)
    });

  // Stream Client 是一个独立长连接进程，所以它不适合放进 Next.js 的 route handler 里。
  const client = new DWClient({
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    debug: input.debug ?? false
  });

  client.registerCallbackListener(
    TOPIC_ROBOT,
    createRobotStreamListener({
      client,
      assistant
    })
  );

  return client;
}
