import type { AssistantResolution } from "./assistant.types";
import type { EntryMode } from "./entry-mode.types";

type ResponseGeneratorInput = {
  query: string;
  entryMode?: EntryMode;
  conversationContext?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  resolution: AssistantResolution;
};

export type ResponseGenerator = {
  generate(input: ResponseGeneratorInput): Promise<string | null>;
};

type CreateResponseGeneratorInput = {
  apiKey: string;
  baseUrl: string;
  model: string;
  fetch?: typeof fetch;
};

function formatConversationContext(
  turns: ResponseGeneratorInput["conversationContext"] = []
) {
  if (turns.length === 0) {
    return "最近对话上下文：无";
  }

  return `最近对话上下文：\n${turns
    .map((turn) => `${turn.role}: ${turn.content}`)
    .join("\n")}`;
}

function formatResolutionFacts(resolution: AssistantResolution) {
  switch (resolution.kind) {
    case "knowledge":
      return [
        "mode: knowledge",
        `title: ${resolution.title}`,
        `answer: ${resolution.answer}`,
        `scope: ${resolution.scope ?? "请以制度原文为准"}`,
        `referenceLabel: ${resolution.referenceLabel ?? "无"}`
      ].join("\n");
    case "task":
      return [
        "mode: task",
        `title: ${resolution.title}`,
        `entry: ${resolution.entry}`,
        `guidance: ${resolution.guidance ?? "请按入口提示继续办理"}`,
        `availability: ${resolution.availability ?? "unknown"}`,
        `availabilityReason: ${resolution.availabilityReason ?? "无"}`
      ].join("\n");
    case "contact":
      return [
        "mode: contact",
        `title: ${resolution.title}`,
        `contactName: ${resolution.contactName}`,
        `team: ${resolution.team ?? "无"}`,
        `description: ${resolution.description}`,
        `actionHint: ${resolution.actionHint ?? "无"}`
      ].join("\n");
    case "clarification":
      return [
        "mode: clarify",
        `prompt: ${resolution.prompt}`,
        `reason: ${resolution.reason ?? "无"}`,
        `reasonCode: ${resolution.reasonCode ?? "无"}`,
        `relatedKeywords: ${resolution.relatedKeywords?.join("、") ?? "无"}`
      ].join("\n");
    case "open_response":
      return [
        "mode: open_response",
        `fallbackReply: ${resolution.reply}`
      ].join("\n");
    case "handoff":
      return [
        "mode: clarify",
        `reason: ${resolution.reason}`
      ].join("\n");
  }
}

function extractTextContent(payload: unknown) {
  const content =
    typeof payload === "object" &&
    payload &&
    "choices" in payload &&
    Array.isArray(payload.choices)
      ? (payload.choices[0] as { message?: { content?: string } })?.message?.content
      : undefined;

  if (typeof content !== "string") {
    return null;
  }

  const normalized = content.trim();
  return normalized.length > 0 ? normalized : null;
}

function formatResponseLog(message: string) {
  return `[response] ${message}`;
}

export function createResponseGenerator(
  input: CreateResponseGeneratorInput
): ResponseGenerator {
  const requestFetch = input.fetch ?? fetch;
  const baseUrl = input.baseUrl.replace(/\/$/, "");

  return {
    async generate(generatorInput) {
      try {
        console.info(
          formatResponseLog(
            `request model="${input.model}" mode=${generatorInput.resolution.kind} query="${generatorInput.query}"`
          )
        );

        const response = await requestFetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${input.apiKey}`
          },
          body: JSON.stringify({
            model: input.model,
            temperature: 0.2,
            messages: [
              {
                role: "system",
                content: [
                  "你是企业员工助手的回复生成器，请基于事实生成自然、简洁的中文回复。",
                  "你是公司内部员工助手，不要询问用户公司名称，也不要假装自己是互联网搜索引擎。",
                  "Facts from providers are authoritative; do not invent links or policies.",
                  "重要：如果事实中包含 entry 字段的链接（尤其是 dingtalk:// 开头的链接），必须在回复中原样嵌入该链接，不得修改、缩短、替换或省略。可以用 Markdown 链接格式包裹，如 [点击发起申请](dingtalk://...)。",
                  "如果 mode 是 task，回复中必须包含 entry 字段提供的链接，这是用户办事的唯一入口。",
                  "如果 mode 是 open_response，说明这轮不需要查公司知识库或事务工具，请直接回答。",
                  "open_response 场景下：用户闲聊就简洁自然地回；用户要通用知识、攻略、天气、常识时就直接给有用答案。",
                  "open_response 场景下严禁假装去查公司制度，也不要把通用问题硬拉回公司知识库。",
                  "如果工具没有给出事实，严禁编造制度、链接或联系人。",
                  "如果有 referenceLabel，请优先自然引用来源。",
                  "如果是 clarify，只问当前最关键的补充问题。",
                  "如果 clarify 带有 relatedKeywords，优先使用工具提供的 relatedKeywords 引导用户。",
                  "如果 clarify 的 reasonCode 是 no_candidate 且没有 relatedKeywords，就建议用户换关键词或联系行政/HR，不要追问无关信息。",
                  "如果上一轮已经表达过未命中，请换一种说法，不要机械重复。",
                  generatorInput.entryMode === "writing"
                    ? "当前 entryMode 是 writing，请按企业写作场景输出更像成稿的中文内容。"
                    : undefined
                ]
                  .filter(Boolean)
                  .join("\n")
              },
              {
                role: "user",
                content: [
                  formatConversationContext(generatorInput.conversationContext),
                  `当前用户消息：${generatorInput.query}`,
                  `entryMode: ${generatorInput.entryMode ?? "none"}`,
                  "工具事实如下：",
                  formatResolutionFacts(generatorInput.resolution)
                ].join("\n\n")
              }
            ]
          })
        });

        if (!response.ok) {
          return null;
        }

        const reply = extractTextContent(await response.json());

        console.info(
          formatResponseLog(
            `response mode=${generatorInput.resolution.kind} query="${generatorInput.query}" generated=${Boolean(reply)}`
          )
        );

        return reply;
      } catch {
        return null;
      }
    }
  };
}

export type { ResponseGeneratorInput };
