import { createAssistantRuntime } from "@/modules/assistant/create-assistant-runtime";

export const runtime = "nodejs";

// route 只保留 HTTP 边界，真正的能力编排统一交给 runtime helper。
// 这样 webhook 与 stream 两个入口可以稳定复用同一套默认依赖。
let assistantRuntime: ReturnType<typeof createAssistantRuntime> | null = null;

function getAssistantRuntime() {
  if (!assistantRuntime) {
    assistantRuntime = createAssistantRuntime();
  }

  return assistantRuntime;
}

type DingTalkWebhookPayload = {
  sessionId?: string;
  text?: {
    content?: string;
  };
};

export async function POST(request: Request) {
  // 当前先按最小消息结构读取文本内容，后续接真实钉钉事件体时再扩展字段。
  const body = (await request.json()) as DingTalkWebhookPayload;
  const message = body.text?.content?.trim();

  if (!message) {
    return Response.json(
      {
        error: "message is required"
      },
      {
        status: 400
      }
    );
  }

  // webhook 这一层只负责收发消息，不承担问答细节，避免路由文件变重。
  const reply = await getAssistantRuntime().assistant.reply({
    query: message,
    // webhook 调试入口默认允许显式透传 sessionId；
    // 没给时就落到一个固定调试会话，方便本地连续调试上下文。
    sessionId: body.sessionId ?? "webhook-debug-session"
  });

  return Response.json({
    reply
  });
}
