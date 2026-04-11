import {
  DWClient,
  EventAck,
  TOPIC_ROBOT,
  type DWClientDownStream,
} from "dingtalk-stream";

import type { AssistantDebugReply } from "@/modules/assistant/assistant.service";
import { createAssistantRuntime } from "@/modules/assistant/create-assistant-runtime";
import type {
  KnowledgeCitation,
  KnowledgeImage,
} from "@/modules/knowledge/retriever.types";
import { createDingTalkStreamHandler } from "./stream-handler";

// assistant 的最小能力约束：给它一句用户问题，它返回一句最终回复。
// 这里故意只依赖 reply，而不关心底层是 FAQ、数据库还是外部模型。
type AssistantPort = {
  reply(input: string | { query: string; sessionId?: string }): Promise<string>;
  replyWithDebug?: (
    input: string | { query: string; sessionId?: string; userId?: string }
  ) => Promise<AssistantDebugReply>;
};

// 回消息的抽象端口。
// 当前实现是通过钉钉下发的 sessionWebhook 回发文本消息。
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
  content?: {
    downloadCode?: string;
    richText?: Array<{
      type?: string;
      text?: string;
      downloadCode?: string;
      pictureDownloadCode?: string;
    }>;
  };
  // senderStaffId 是钉钉企业内的 userId，用于懒加载用户信息和 OA 代发起。
  // senderNick 是消息 payload 里的昵称，API 拉取失败时作为兜底。
  senderStaffId?: string;
  senderNick?: string;
};

function extractRichTextText(
  richText: Array<{
    text?: string;
  }> = [],
) {
  const text = richText
    .map((item) => (typeof item.text === "string" ? item.text : ""))
    .join("")
    .trim();

  return text.length > 0 ? text : undefined;
}

function extractRichTextPictureDownloadCode(
  richText: Array<{
    type?: string;
    downloadCode?: string;
    pictureDownloadCode?: string;
  }> = [],
) {
  const picture = richText.find(
    (item) =>
      item.type === "picture" &&
      (typeof item.downloadCode === "string" ||
        typeof item.pictureDownloadCode === "string"),
  );

  if (!picture) {
    return undefined;
  }

  const downloadCode = picture.downloadCode ?? picture.pictureDownloadCode;
  return typeof downloadCode === "string" && downloadCode.trim().length > 0
    ? downloadCode
    : undefined;
}

function stripImagePlaceholders(text: string): string {
  return text.replace(/\{\{([^}]+)\}\}/g, "$1");
}

function stripInlineReferenceFooter(text: string): string {
  return text
    .replace(/\n\s*\[依据\]:[^\n]*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildMarkdownReply(input: {
  text: string;
  citations?: KnowledgeCitation[];
  uploadedImages: Array<{ name: string; mediaId: string; preview?: string }>;
}) {
  let markdownText = stripInlineReferenceFooter(input.text);

  for (const image of input.uploadedImages) {
    markdownText = markdownText.replace(
      `{{${image.name}}}`,
      image.name,
    );
  }

  const appendix = input.uploadedImages
    .map((image) =>
      [
        `### ${image.name}`,
        `![${image.name}](${image.mediaId})`,
        image.preview ? `> ${image.preview}` : undefined,
      ]
        .filter(Boolean)
        .join("\n\n"),
    )
    .join("\n\n");

  const citationSection =
    input.citations && input.citations.length > 0
      ? [
          "### 依据来源",
          input.citations
            .map((citation) =>
              citation.sourceUrl
                ? `- [${citation.documentTitle}](${citation.sourceUrl})`
                : `- ${citation.documentTitle}`,
            )
            .join("\n"),
        ].join("\n\n")
      : "";

  return {
    title: stripImagePlaceholders(markdownText),
    text: [markdownText, appendix, citationSection].filter(Boolean).join("\n\n"),
  };
}

async function getAppAccessToken(input: {
  fetchImpl: typeof fetch;
  clientId: string;
  clientSecret: string;
}) {
  const response = await input.fetchImpl(
    "https://api.dingtalk.com/v1.0/oauth2/accessToken",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        appKey: input.clientId,
        appSecret: input.clientSecret,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`access token request failed with ${response.status}`);
  }

  const data = (await response.json()) as {
    accessToken?: string;
    access_token?: string;
  };
  const accessToken = data.accessToken ?? data.access_token;

  if (!accessToken) {
    throw new Error("missing access token");
  }

  return accessToken;
}

export async function downloadDingTalkImageAsBase64(input: {
  fetchImpl: typeof fetch;
  clientId: string;
  clientSecret: string;
  downloadCode: string;
  robotCode: string;
}) {
  const accessToken = await getAppAccessToken({
    fetchImpl: input.fetchImpl,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
  });

  const response = await input.fetchImpl(
    "https://api.dingtalk.com/v1.0/robot/messageFiles/download",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-acs-dingtalk-access-token": accessToken,
      },
      body: JSON.stringify({
        downloadCode: input.downloadCode,
        robotCode: input.robotCode,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to get image download URL: ${response.status}`);
  }

  const data = (await response.json()) as { downloadUrl?: string };
  if (!data.downloadUrl) {
    throw new Error("Missing downloadUrl in DingTalk response");
  }

  const imgRes = await input.fetchImpl(data.downloadUrl);
  if (!imgRes.ok) {
    throw new Error(`Failed to download image from CDN: ${imgRes.status}`);
  }

  const buffer = await imgRes.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  const contentType = imgRes.headers.get("content-type") || "image/jpeg";
  return `data:${contentType};base64,${base64}`;
}

async function uploadImageMedia(input: {
  fetchImpl: typeof fetch;
  accessToken: string;
  image: KnowledgeImage;
}) {
  if (!input.image.data) {
    throw new Error("missing image data");
  }

  const formData = new FormData();
  const bytes = Uint8Array.from(atob(input.image.data), (char) =>
    char.charCodeAt(0),
  );
  const blob = new Blob([bytes], {
    type: "image/png",
  });
  formData.set(
    "media",
    blob,
    `${input.image.name.replace(/\s+/g, "-") || "knowledge-image"}.png`,
  );

  const response = await input.fetchImpl(
    `https://oapi.dingtalk.com/media/upload?access_token=${encodeURIComponent(
      input.accessToken,
    )}&type=image`,
    {
      method: "POST",
      body: formData,
    },
  );

  if (!response.ok) {
    throw new Error(`media upload failed with ${response.status}`);
  }

  const data = (await response.json()) as {
    media_id?: string;
    mediaId?: string;
  };
  const mediaId = data.media_id ?? data.mediaId;

  if (!mediaId) {
    throw new Error("missing media id");
  }

  return mediaId;
}

export function createSessionWebhookReplier(
  fetchImpl: typeof fetch = fetch,
  credentials?: {
    clientId?: string;
    clientSecret?: string;
  },
): StreamReplyPort {
  return {
    async replyMarkdown(sessionWebhook: string, text: string, options) {
      const citations = options?.citations;
      const images =
        options?.images?.filter((image) => Boolean(image.data)) ?? [];

      let requestBody:
        | {
            msgtype: "text";
            text: {
              content: string;
            };
          }
        | {
            msgtype: "markdown";
            markdown: {
              title: string;
              text: string;
            };
          } = {
        msgtype: "text",
        text: {
          content: text,
        },
      };

      if (
        ((citations && citations.length > 0) || images.length > 0) &&
        credentials?.clientId &&
        credentials?.clientSecret
      ) {
        try {
          let uploadedImages: Array<{
            name: string;
            mediaId: string;
            preview?: string;
          }> = [];

          if (images.length > 0) {
            const accessToken = await getAppAccessToken({
              fetchImpl,
              clientId: credentials.clientId,
              clientSecret: credentials.clientSecret,
            });
            uploadedImages = await Promise.all(
              images.map(async (image) => ({
                name: image.name,
                mediaId: await uploadImageMedia({
                  fetchImpl,
                  accessToken,
                  image,
                }),
                preview: image.preview,
              })),
            );
          }
          requestBody = {
            msgtype: "markdown",
            markdown: buildMarkdownReply({
              text,
              citations,
              uploadedImages,
            }),
          };
        } catch {
          requestBody = {
            msgtype: "text",
            text: {
              content: stripImagePlaceholders(text),
            },
          };
        }
      }

      const response = await fetchImpl(sessionWebhook, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
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
  replier?: StreamReplyPort;
  onSender?: (userId: string, nick?: string) => void;
  credentials?: { clientId?: string; clientSecret?: string };
}) {
  const handler = createDingTalkStreamHandler({
    assistant: input.assistant,
    replier: input.replier ?? createSessionWebhookReplier(),
  });

  return async function onBotMessage(
    event: Pick<DWClientDownStream, "data" | "headers">,
  ) {
    try {
      const message = JSON.parse(event.data) as StreamRobotMessage & {
        msgtype?: string;
        robotCode?: string;
        imageUrl?: string;
      };

      const richText = Array.isArray(message.content?.richText)
        ? message.content.richText
        : [];
      const richTextText = extractRichTextText(richText);

      if (!message.text?.content && richTextText) {
        message.text = {
          content: richTextText,
        };
      }

      const imageDownloadCode =
        message.msgtype === "picture"
          ? message.content?.downloadCode
          : message.msgtype === "richText"
            ? extractRichTextPictureDownloadCode(richText)
            : undefined;

      if (
        imageDownloadCode &&
        message.robotCode &&
        input.credentials?.clientId &&
        input.credentials?.clientSecret
      ) {
        try {
          message.imageUrl = await downloadDingTalkImageAsBase64({
            fetchImpl: fetch,
            clientId: input.credentials.clientId,
            clientSecret: input.credentials.clientSecret,
            downloadCode: imageDownloadCode,
            robotCode: message.robotCode,
          });
          if (!message.text?.content?.trim()) {
            message.text = { content: "[图片消息]" };
          }
        } catch (err) {
          console.error("[stream] failed to download image from dingtalk:", err);
        }
      }

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
      console.error("[stream] error handling message:", error);
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
      replier: createSessionWebhookReplier(fetch, {
        clientId: input.clientId,
        clientSecret: input.clientSecret,
      }),
      onSender: input.onSender,
      credentials: {
        clientId: input.clientId,
        clientSecret: input.clientSecret,
      },
    }),
  );

  return client;
}
