import { createAssistantRuntime } from "@/modules/assistant/create-assistant-runtime";
import type { AssistantResolution } from "@/modules/assistant/assistant.types";
import type { EntryMode } from "@/modules/assistant/entry-mode.types";
import type { AssistantDebugReply } from "@/modules/assistant/assistant.service";
import { resolveUserQuery } from "@/modules/assistant/user-query";
import type { RagSearchItem } from "@/modules/knowledge/knowledge-api-client";

export const runtime = "nodejs";

let assistantRuntime: ReturnType<typeof createAssistantRuntime> | null = null;

function getAssistantRuntime() {
  if (!assistantRuntime) {
    assistantRuntime = createAssistantRuntime({
      corpId: process.env.DINGTALK_CORP_ID,
    });
  }

  return assistantRuntime;
}

function maskIdentifier(value?: string) {
  if (!value) {
    return undefined;
  }

  if (value.length <= 8) {
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }

  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

type DingTalkWebhookPayload = {
  sessionId?: string;
  entryMode?: EntryMode;
  imageUrl?: string;
  imageUrls?: string[];
  text?: {
    content?: string;
  };
  senderStaffId?: string;
  senderId?: string;
  senderSource?: string;
  senderDiagnostics?: Record<string, boolean | string | undefined>;
};

function resolveImageUrls(input: {
  imageUrl?: string;
  imageUrls?: string[];
}) {
  if (Array.isArray(input.imageUrls)) {
    const normalized = input.imageUrls
      .filter((imageUrl): imageUrl is string => typeof imageUrl === "string")
      .map((imageUrl) => imageUrl.trim())
      .filter(Boolean);

    if (normalized.length > 0) {
      return normalized;
    }
  }

  if (typeof input.imageUrl === "string" && input.imageUrl.trim().length > 0) {
    return [input.imageUrl.trim()];
  }

  return [];
}

type WebhookStreamChunkEvent = {
  type: "chunk";
  content: string;
};

type WebhookStreamDoneEvent = {
  type: "done";
  reply: string;
  citations?: Array<{ documentTitle: string; sourceUrl?: string }>;
  images?: Array<{ name: string; data?: string; preview?: string }>;
  kind?: AssistantResolution["kind"];
  meta?: Record<string, string | undefined>;
};

type WebhookStreamErrorEvent = {
  type: "error";
  message: string;
};

type StreamRagSource = RagSearchItem & {
  imageUrl?: string;
};

function buildResponseMeta(resolution: AssistantResolution) {
  switch (resolution.kind) {
    case "knowledge":
      return {
        title: resolution.title,
        scope: resolution.scope,
      };
    case "task":
      return {
        title: resolution.title,
        entry: resolution.entry,
      };
    case "contact":
      return {
        title: resolution.title,
        contactName: resolution.contactName,
        team: resolution.team,
        actionHint: resolution.actionHint,
      };
    default:
      return undefined;
  }
}

function buildResponseCitations(resolution: AssistantResolution) {
  if (resolution.kind !== "knowledge") {
    return undefined;
  }

  if (resolution.citations && resolution.citations.length > 0) {
    return resolution.citations;
  }

  if (resolution.sourceUrl) {
    return [
      {
        documentTitle: resolution.referenceLabel ?? resolution.sourceUrl,
        sourceUrl: resolution.sourceUrl,
      },
    ];
  }

  return undefined;
}

function buildSourceCitations(sources: RagSearchItem[]) {
  const citations = new Map<string, { documentTitle: string; sourceUrl?: string }>();

  for (const source of sources) {
    const citationKey =
      source.sourceUrl || `${source.title}:${source.documentId}:${source.chunkId}`;

    if (!citations.has(citationKey)) {
      citations.set(citationKey, {
        documentTitle: source.title,
        sourceUrl: source.sourceUrl,
      });
    }
  }

  return [...citations.values()];
}

function resolveRagAssetUrl(imageUrl: string) {
  try {
    return new URL(imageUrl).toString();
  } catch {
    const baseUrl = process.env.RAG_API_URL;

    if (!baseUrl) {
      return null;
    }

    return new URL(imageUrl, baseUrl).toString();
  }
}

async function fetchImageAsBase64(imageUrl: string) {
  const resolvedUrl = resolveRagAssetUrl(imageUrl);

  if (!resolvedUrl) {
    return undefined;
  }

  const response = await fetch(resolvedUrl);

  if (!response.ok) {
    return undefined;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.toString("base64");
}

async function hydrateSourceImages(sources: StreamRagSource[]) {
  const images = await Promise.all(
    sources
      .filter(
        (source) =>
          (typeof source.imageData === "string" && source.imageData.length > 0) ||
          (typeof source.imageUrl === "string" && source.imageUrl.length > 0),
      )
      .map(async (source, index) => ({
        name: `图${index + 1}`,
        data:
          source.imageData ||
          (source.imageUrl ? await fetchImageAsBase64(source.imageUrl) : undefined),
        preview: source.chunkText,
      })),
  );

  return images.filter((image) => image.data);
}

async function buildAskFallbackImages(input: {
  query: string;
  userId?: string;
}) {
  const runtime = getAssistantRuntime();

  if (!runtime.externalKnowledge?.ask) {
    return undefined;
  }

  try {
    const response = await runtime.externalKnowledge.ask({
      question: input.query,
      operatorId: input.userId || "unknown",
      maxSources: 5,
      excludeImageData: false,
    });

    if (!response.pics || response.pics.length === 0) {
      return undefined;
    }

    return response.pics
      .filter((picture) => picture.data)
      .map((picture) => ({
        name: picture.name,
        data: picture.data,
        preview: picture.preview,
      }));
  } catch (error) {
    console.warn("[webhook/stream] sync ask image fallback failed", error);
    return undefined;
  }
}

function shouldAttemptAskFallbackImages(input: {
  reply: string;
  sources: StreamRagSource[];
}) {
  if (/\{\{[^}]+\}\}/u.test(input.reply)) {
    return true;
  }

  return input.sources.some(
    (source) =>
      (typeof source.imageData === "string" && source.imageData.length > 0) ||
      (typeof source.imageUrl === "string" && source.imageUrl.length > 0),
  );
}

function buildSseHeaders() {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  };
}

function serializeSseEvent(
  payload: WebhookStreamChunkEvent | WebhookStreamDoneEvent | WebhookStreamErrorEvent,
) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function serializeDoneMarker() {
  return "data: [DONE]\n\n";
}

function createSyntheticStreamResponse(debugResult: AssistantDebugReply) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            serializeSseEvent({
              type: "chunk",
              content: debugResult.reply,
            }),
          ),
        );
        controller.enqueue(
          encoder.encode(
            serializeSseEvent({
              type: "done",
              reply: debugResult.reply,
              citations: buildResponseCitations(debugResult.resolution),
              images:
                debugResult.resolution.kind === "knowledge"
                  ? debugResult.resolution.images
                  : undefined,
              kind: debugResult.resolution.kind,
              meta: buildResponseMeta(debugResult.resolution),
            }),
          ),
        );
        controller.enqueue(encoder.encode(serializeDoneMarker()));
        controller.close();
      },
    }),
    {
      headers: buildSseHeaders(),
    },
  );
}

async function createExternalKnowledgeStreamResponse(input: {
  query: string;
  sessionId?: string;
  userId?: string;
}) {
  const runtime = getAssistantRuntime();
  const ragSessionId = runtime.externalKnowledge?.getMappedSessionId(input.sessionId);
  const upstreamResponse = await runtime.externalKnowledge!.askStream({
    question: input.query,
    operatorId: input.userId || "unknown",
    sessionId: ragSessionId,
    maxSources: 5,
    excludeImageData: false,
  });
  const upstreamBody = upstreamResponse.body;

  if (!upstreamBody) {
    throw new Error("知识库流式响应为空");
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const upstreamReader = upstreamBody.getReader();
  let reply = "";
  let buffer = "";
  let streamClosed = false;

  return new Response(
    new ReadableStream({
      async start(controller) {
        const closeSafely = () => {
          if (streamClosed) {
            return;
          }

          streamClosed = true;
          controller.close();
        };

        const emit = (
          payload: WebhookStreamChunkEvent | WebhookStreamDoneEvent | WebhookStreamErrorEvent,
        ) => {
          controller.enqueue(encoder.encode(serializeSseEvent(payload)));
        };

        const emitDoneMarker = () => {
          controller.enqueue(encoder.encode(serializeDoneMarker()));
        };

        const processBlock = async (block: string) => {
          const data = block
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.replace(/^data:\s*/u, ""))
            .join("\n")
            .trim();

          if (!data) {
            return;
          }

          if (data === "[DONE]") {
            emitDoneMarker();
            closeSafely();
            return;
          }

          const event = JSON.parse(data) as
            | {
                type?: string;
                content?: string;
                message?: string;
                sessionId?: string;
                sources?: StreamRagSource[];
              }
            | undefined;

          if (!event?.type) {
            return;
          }

          if (event.type === "chunk") {
            const content = event.content ?? "";
            reply += content;
            emit({
              type: "chunk",
              content,
            });
            return;
          }

          if (event.type === "done") {
            runtime.externalKnowledge?.setMappedSessionId(
              input.sessionId,
              event.sessionId,
            );

            const sources = Array.isArray(event.sources) ? event.sources : [];
            const citations = buildSourceCitations(sources);
            const hydratedImages = await hydrateSourceImages(sources);
            const shouldFallbackImages = shouldAttemptAskFallbackImages({
              reply,
              sources,
            });
            const fallbackImages =
              hydratedImages.length > 0 || !shouldFallbackImages
                ? undefined
                : await buildAskFallbackImages({
                    query: input.query,
                    userId: input.userId,
                  });
            const images =
              hydratedImages.length > 0
                ? hydratedImages
                : (fallbackImages ?? []);

            emit({
              type: "done",
              reply,
              citations: citations.length > 0 ? citations : undefined,
              images: images.length > 0 ? images : undefined,
              kind: "knowledge",
              meta: {
                title: citations[0]?.documentTitle ?? "知识库回答",
              },
            });
            emitDoneMarker();
            closeSafely();
            return;
          }

          if (event.type === "error") {
            emit({
              type: "error",
              message: event.message ?? "知识库流式返回错误",
            });
          }
        };

        try {
          while (true) {
            const { done, value } = await upstreamReader.read();

            if (done) {
              break;
            }

            buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
            const blocks = buffer.split("\n\n");
            buffer = blocks.pop() ?? "";

            for (const block of blocks) {
              await processBlock(block);

              if (streamClosed) {
                return;
              }
            }
          }

          buffer += decoder.decode();

          if (buffer.trim()) {
            await processBlock(buffer);
          }

          if (!streamClosed) {
            emitDoneMarker();
            closeSafely();
          }
        } catch (error) {
          emit({
            type: "error",
            message:
              error instanceof Error ? error.message : "知识库流式读取失败",
          });
          closeSafely();
        } finally {
          upstreamReader.releaseLock();
        }
      },
    }),
    {
      headers: buildSseHeaders(),
    },
  );
}

export async function POST(request: Request) {
  const body = (await request.json()) as DingTalkWebhookPayload;
  const imageUrls = resolveImageUrls(body);
  const message = resolveUserQuery({
    text: body.text?.content,
    imageUrl: body.imageUrl,
    imageUrls,
  });

  if (!message) {
    return Response.json(
      {
        error: "message is required",
      },
      {
        status: 400,
      },
    );
  }

  const assistantInput = {
    query: message,
    sessionId: body.sessionId ?? "webhook-debug-session",
    entryMode: body.entryMode,
    userId: body.senderStaffId || body.senderId,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
  };
  console.info("[webhook/stream] incoming sender", {
    senderId: maskIdentifier(body.senderId),
    senderStaffId: maskIdentifier(body.senderStaffId),
    resolvedUserId: maskIdentifier(assistantInput.userId),
    sessionId: assistantInput.sessionId,
    senderSource: body.senderSource,
    senderDiagnostics: body.senderDiagnostics,
  });
  const runtime = getAssistantRuntime();

  if (imageUrls.length > 0) {
    const debugResult = await runtime.assistant.replyWithDebug(assistantInput);
    return createSyntheticStreamResponse(debugResult);
  }

  try {
    const intent = await runtime.analyzer.analyze({
      query: assistantInput.query,
      entryMode: assistantInput.entryMode,
      imageUrls: assistantInput.imageUrls,
    });

    if (
      intent.mode === "internal_knowledge" &&
      runtime.externalKnowledge
    ) {
      return await createExternalKnowledgeStreamResponse(assistantInput);
    }
  } catch (error) {
    console.warn("[webhook/stream] intent analyze failed, fallback to sync", error);
  }

  const debugResult = await runtime.assistant.replyWithDebug(assistantInput);
  return createSyntheticStreamResponse(debugResult);
}
