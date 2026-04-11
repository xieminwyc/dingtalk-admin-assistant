import { createAssistantRuntime } from "@/modules/assistant/create-assistant-runtime";
import type { EntryMode } from "@/modules/assistant/entry-mode.types";
import type { AssistantResolution } from "@/modules/assistant/assistant.types";
import { resolveUserQuery } from "@/modules/assistant/user-query";

export const runtime = "nodejs";

// route 只保留 HTTP 边界，真正的能力编排统一交给 runtime helper。
// 这样 webhook 与 stream 两个入口可以稳定复用同一套默认依赖。
let assistantRuntime: ReturnType<typeof createAssistantRuntime> | null = null;

function getAssistantRuntime() {
  if (!assistantRuntime) {
    assistantRuntime = createAssistantRuntime({
      corpId: process.env.DINGTALK_CORP_ID,
    });
  }

  return assistantRuntime;
}

type DingTalkWebhookPayload = {
  sessionId?: string;
  debug?: boolean;
  entryMode?: EntryMode;
  imageUrl?: string;
  imageUrls?: string[];
  text?: {
    content?: string;
  };
  senderStaffId?: string;
  senderId?: string;
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

function buildDebugExternalRag(resolution: AssistantResolution) {
  if (resolution.kind !== "knowledge") {
    return undefined;
  }

  if (!resolution.providerMeta?.ragAskResponse) {
    return undefined;
  }

  return {
    askResponse: resolution.providerMeta.ragAskResponse,
  };
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

export async function POST(request: Request) {
  // 当前先按最小消息结构读取文本内容，后续接真实钉钉事件体时再扩展字段。
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

  // webhook 这一层只负责收发消息，不承担问答细节，避免路由文件变重。
  const assistantInput = {
    query: message,
    // webhook 调试入口默认允许显式透传 sessionId；
    // 没给时就落到一个固定调试会话，方便本地连续调试上下文。
    sessionId: body.sessionId ?? "webhook-debug-session",
    entryMode: body.entryMode,
    userId: body.senderStaffId || body.senderId,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
  };

  const debugResult = await getAssistantRuntime().assistant.replyWithDebug(assistantInput);

  return Response.json({
    reply: debugResult.reply,
    citations: buildResponseCitations(debugResult.resolution),
    images:
      debugResult.resolution.kind === "knowledge"
        ? debugResult.resolution.images
        : undefined,
    kind: debugResult.resolution.kind,
    meta: buildResponseMeta(debugResult.resolution),
    debug: body.debug ? {
      conversationContext: debugResult.conversationContext,
      intent: debugResult.intent,
      resolution: debugResult.resolution,
      externalRag: buildDebugExternalRag(debugResult.resolution),
      usedResponseGenerator: debugResult.usedResponseGenerator,
    } : undefined
  });
}
