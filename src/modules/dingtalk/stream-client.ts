import {
  DWClient,
  EventAck,
  TOPIC_ROBOT,
  type DWClientDownStream,
} from "dingtalk-stream";

import { createAssistantRuntime } from "@/modules/assistant/create-assistant-runtime";
import { createDingTalkStreamHandler } from "./stream-handler";

// assistant 的最小能力约束：给它一句用户问题，它返回一句最终回复。
// 这里故意只依赖 reply，而不关心底层是 FAQ、数据库还是外部模型。
type AssistantPort = {
  reply(input: string | { query: string; sessionId?: string }): Promise<string>;
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
  // senderStaffId 是钉钉企业内的 userId，用于懒加载用户信息和 OA 代发起。
  // senderNick 是消息 payload 里的昵称，API 拉取失败时作为兜底。
  senderStaffId?: string;
  senderNick?: string;
};

export function createSessionWebhookReplier(
  fetchImpl: typeof fetch = fetch,
): StreamReplyPort {
  return {
    async replyMarkdown(sessionWebhook: string, text: string) {
      const response = await fetchImpl(sessionWebhook, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          msgtype: "text",
          text: {
            content: text,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(
          `session webhook request failed with ${response.status}`,
        );
      }
    },
  };
}

export function createRobotStreamListener(input: {
  client: SocketAckPort;
  assistant: AssistantPort;
  replier?: StreamReplyPort; // 可选回调：每次收到合法消息时，通知外层记录发送者信息（懒加载用户数据）。
  onSender?: (userId: string, nick?: string) => void;
}) {
  // 这里把“钉钉事件监听”与“业务回复逻辑”拆开：
  // Stream SDK 负责长连接收消息，handler 负责解析消息并组织回复。
  const handler = createDingTalkStreamHandler({
    assistant: input.assistant,
    replier: input.replier ?? createSessionWebhookReplier(),
  });

  return async function onBotMessage(
    event: Pick<DWClientDownStream, "data" | "headers">,
  ) {
    try {
      // event.data 是字符串，需要先反序列化成业务更容易处理的对象。
      const message = JSON.parse(event.data) as StreamRobotMessage;

      // 触发发送者的懒加载（fire-and-forget，不阻塞消息回复）。
      if (message.senderStaffId && input.onSender) {
        input.onSender(message.senderStaffId, message.senderNick);
      }

      const result = await handler(message);

      if (result.success) {
        // 只有真正完成回复后才 ACK success，避免把可重试的软失败直接吞掉。
        input.client.socketCallBackResponse(
          event.headers.messageId,
          EventAck.SUCCESS,
        );
        return;
      }

      if (!result.retryable) {
        // payload 本身就不合法时，重试不会带来任何变化，直接消费掉避免 poison message。
        input.client.socketCallBackResponse(
          event.headers.messageId,
          EventAck.SUCCESS,
        );
        return;
      }

      input.client.socketCallBackResponse(event.headers.messageId, {
        status: EventAck.LATER,
        message: result.reason,
      });
    } catch (error) {
      // 返回 LATER 表示“这次没处理成功，可以稍后重试”。
      // 这样既能保留失败原因，也能让上游按协议决定是否重投。
      input.client.socketCallBackResponse(event.headers.messageId, {
        status: EventAck.LATER,
        message:
          error instanceof Error ? error.message : "stream handler failed",
      });
    }
  };
}

export function createDingTalkStreamClient(input: {
  clientId: string;
  clientSecret: string;
  assistant?: AssistantPort;
  debug?: boolean;
  onSender?: (userId: string, nick?: string) => void;
  corpId?: string;
}) {
  // 默认 assistant 统一从 runtime helper 组装，确保 stream 与 webhook 入口走同一条能力链路。
  const assistant =
    input.assistant ??
    createAssistantRuntime({ corpId: input.corpId }).assistant;

  // Stream Client 是一个独立长连接进程。
  // 它会持续连接钉钉服务器收事件，因此更适合运行在常驻进程里，
  // 不适合放进 Next.js 这类“请求来一下、处理完就结束”的 route handler。
  const client = new DWClient({
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    debug: input.debug ?? false,
  });

  // 只订阅机器人消息主题。
  // 一旦钉钉推来 TOPIC_ROBOT 事件，就交给上面创建的 listener 处理。
  client.registerCallbackListener(
    TOPIC_ROBOT,
    createRobotStreamListener({
      client,
      assistant,
      onSender: input.onSender,
    }),
  );

  return client;
}
