import {
  DWClient,
  EventAck,
  TOPIC_ROBOT,
  type DWClientDownStream
} from "dingtalk-stream";

import { createAssistantRuntime } from "@/modules/assistant/create-assistant-runtime";
import { createDingTalkStreamHandler } from "./stream-handler";

// assistant 的最小能力约束：给它一句用户问题，它返回一句最终回复。
// 这里故意只依赖 reply，而不关心底层是 FAQ、数据库还是外部模型。
type AssistantPort = {
  reply(query: string): Promise<string>;
};

// 回消息的抽象端口。
// 当前实现是通过钉钉下发的 sessionWebhook 回发文本消息。
type StreamReplyPort = {
  replyMarkdown(sessionWebhook: string, text: string): Promise<void>;
};

// Stream SDK 提供的 ACK 能力抽象。
// 我们处理完事件后，需要通过它告诉钉钉“这条消息我收到了，是否需要重试”。
type SocketAckPort = {
  socketCallBackResponse(messageId: string, result: unknown): void;
};

// 这里只声明当前业务真正会用到的那部分机器人消息结构。
// 钉钉原始消息字段可能更多，但这里先保持最小依赖面。
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
      // sessionWebhook 可以理解为“这次会话专用的回消息地址”。
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
  // 这里把“钉钉事件监听”与“业务回复逻辑”拆开：
  // Stream SDK 负责长连接收消息，handler 负责解析消息并组织回复。
  const handler = createDingTalkStreamHandler({
    assistant: input.assistant,
    replier: input.replier ?? createSessionWebhookReplier()
  });

  return async function onBotMessage(
    event: Pick<DWClientDownStream, "data" | "headers">
  ) {
    try {
      // event.data 是字符串，需要先反序列化成业务更容易处理的对象。
      const message = JSON.parse(event.data) as StreamRobotMessage;
      const result = await handler(message);

      if (result.success) {
        // 只有真正完成回复后才 ACK success，避免把可重试的软失败直接吞掉。
        input.client.socketCallBackResponse(event.headers.messageId, EventAck.SUCCESS);
        return;
      }

      if (!result.retryable) {
        // payload 本身就不合法时，重试不会带来任何变化，直接消费掉避免 poison message。
        input.client.socketCallBackResponse(event.headers.messageId, EventAck.SUCCESS);
        return;
      }

      input.client.socketCallBackResponse(event.headers.messageId, {
        status: EventAck.LATER,
        message: result.reason
      });
    } catch (error) {
      // 返回 LATER 表示“这次没处理成功，可以稍后重试”。
      // 这样既能保留失败原因，也能让上游按协议决定是否重投。
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
  // 默认 assistant 统一从 runtime helper 组装，确保 stream 与 webhook 入口走同一条能力链路。
  const assistant = input.assistant ?? createAssistantRuntime().assistant;

  // Stream Client 是一个独立长连接进程。
  // 它会持续连接钉钉服务器收事件，因此更适合运行在常驻进程里，
  // 不适合放进 Next.js 这类“请求来一下、处理完就结束”的 route handler。
  const client = new DWClient({
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    debug: input.debug ?? false
  });

  // 只订阅机器人消息主题。
  // 一旦钉钉推来 TOPIC_ROBOT 事件，就交给上面创建的 listener 处理。
  client.registerCallbackListener(
    TOPIC_ROBOT,
    createRobotStreamListener({
      client,
      assistant
    })
  );

  return client;
}
