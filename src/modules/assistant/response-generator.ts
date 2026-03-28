import type { AssistantResolution } from "./assistant.types";

type ResponseGeneratorInput = {
  query: string;
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
    case "clarification":
      return [
        "mode: clarify",
        `prompt: ${resolution.prompt}`,
        `reason: ${resolution.reason ?? "无"}`,
        `relatedKeywords: ${resolution.relatedKeywords?.join("、") ?? "无"}`
      ].join("\n");
    case "smalltalk":
      return [
        "mode: chat",
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
                  "Facts from providers are authoritative; do not invent links or policies.",
                  "如果有 referenceLabel，请优先自然引用来源。",
                  "如果是 clarify，只问当前最关键的补充问题。"
                ].join("\n")
              },
              {
                role: "user",
                content: [
                  formatConversationContext(generatorInput.conversationContext),
                  `当前用户消息：${generatorInput.query}`,
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
