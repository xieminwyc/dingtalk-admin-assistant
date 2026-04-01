import { createAssistantRuntime } from "@/modules/assistant/create-assistant-runtime";
import type { EntryMode } from "@/modules/assistant/entry-mode.types";

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
  text?: {
    content?: string;
  };
  senderStaffId?: string;
  senderId?: string;
};

export async function POST(request: Request) {
  // 当前先按最小消息结构读取文本内容，后续接真实钉钉事件体时再扩展字段。
  const body = (await request.json()) as DingTalkWebhookPayload;
  const message = body.text?.content?.trim();

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
  };

  const debugResult = await getAssistantRuntime().assistant.replyWithDebug(assistantInput);

  // 既然你提到“变通”，我们这里就利用一个绝妙的变通方法：
  // 无论前端有没有要求，我们直接把后端查到的「大模型知识片段」悄悄塞进前端 Network 的响应体里！
  // 这样你在浏览器网络选项卡点击 webhook，不仅能看到 reply，还能直接看到查询知识库的痕迹了！
  return Response.json({
    reply: debugResult.reply,
    _rag_tracing_: {
      instruction: "看这里！这就是后端默默查询外部服务器的证据",
      intent: debugResult.intent.intent,
      mode: debugResult.intent.mode,
      knowledge_hit: 'title' in debugResult.resolution ? debugResult.resolution.title : "无实体标题",
      source_link: 'sourceUrl' in debugResult.resolution ? debugResult.resolution.sourceUrl : "无来源链接",
    },
    debug: body.debug ? {
      conversationContext: debugResult.conversationContext,
      intent: debugResult.intent,
      resolution: debugResult.resolution,
      usedResponseGenerator: debugResult.usedResponseGenerator,
    } : undefined
  });
}
