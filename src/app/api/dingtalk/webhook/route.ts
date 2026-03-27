import { FaqKnowledgeRetriever } from "@/modules/knowledge/faq-retriever";
import { sampleAdminFaq } from "@/modules/knowledge/sample-faq";
import { createAssistantService } from "@/modules/assistant/assistant.service";

export const runtime = "nodejs";

// 一期先用内置 FAQ 检索器把主链路跑通，后续再替换成数据库或外部 RAG Provider。
const assistantService = createAssistantService({
  retriever: new FaqKnowledgeRetriever(sampleAdminFaq)
});

type DingTalkWebhookPayload = {
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
  const reply = await assistantService.reply(message);

  return Response.json({
    reply
  });
}
