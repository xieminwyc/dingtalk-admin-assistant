import type { ConversationContextTurn } from "../logging/conversation-context.service";
import type { AssistantDecision, AssistantMode } from "./intent.types";

export type ModelIntentClassifierInput = {
  query: string;
  conversationContext?: ConversationContextTurn[];
};

export type ModelIntentClassifier = {
  classify(
    input: string | ModelIntentClassifierInput
  ): Promise<AssistantDecision>;
};

type CreateModelIntentClassifierInput = {
  apiKey: string;
  baseUrl: string;
  model: string;
  fetch?: typeof fetch;
};

const SUPPORTED_MODES: AssistantMode[] = [
  "knowledge",
  "task",
  "chat",
  "clarify"
];
const DEFAULT_CLARIFY_QUESTION =
  "我先确认一下，你是想查制度说明，还是想办理流程？";

function isAssistantMode(value: unknown): value is AssistantMode {
  return SUPPORTED_MODES.includes(value as AssistantMode);
}

function clampConfidence(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function fallbackToolUsageByMode(mode: AssistantMode) {
  return {
    needKnowledge: mode === "knowledge",
    needTaskResolution: mode === "task"
  };
}

function buildFallbackDecision(): AssistantDecision {
  return {
    mode: "clarify",
    intentConfidence: 0,
    needKnowledge: false,
    needTaskResolution: false,
    topicShift: false,
    clarifyQuestion: DEFAULT_CLARIFY_QUESTION
  };
}

function pickOptionalText(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function extractDecisionFromContent(content: string): AssistantDecision {
  try {
    const parsed = JSON.parse(content) as Partial<AssistantDecision>;

    if (!isAssistantMode(parsed.mode)) {
      return buildFallbackDecision();
    }

    const fallbackUsage = fallbackToolUsageByMode(parsed.mode);

    return {
      mode: parsed.mode,
      intentConfidence: clampConfidence(parsed.intentConfidence),
      needKnowledge:
        typeof parsed.needKnowledge === "boolean"
          ? parsed.needKnowledge
          : fallbackUsage.needKnowledge,
      needTaskResolution:
        typeof parsed.needTaskResolution === "boolean"
          ? parsed.needTaskResolution
          : fallbackUsage.needTaskResolution,
      topicShift: Boolean(parsed.topicShift),
      contextBreakConfidence:
        typeof parsed.contextBreakConfidence === "number"
          ? clampConfidence(parsed.contextBreakConfidence)
          : undefined,
      clarifyQuestion:
        pickOptionalText(parsed.clarifyQuestion) ??
        (parsed.mode === "clarify" ? DEFAULT_CLARIFY_QUESTION : undefined),
      knowledgeHint: pickOptionalText(parsed.knowledgeHint),
      taskHint: pickOptionalText(parsed.taskHint)
    };
  } catch {
    // 大模型偶发返回非 JSON 时，统一降级到 clarify，
    // 避免把自然语言段落误当成结构化决策继续往下游传。
  }

  return buildFallbackDecision();
}

function formatConversationContext(turns: ConversationContextTurn[] = []) {
  if (turns.length === 0) {
    return "最近对话上下文：无";
  }

  const lines = turns.map((turn) => `${turn.role}: ${turn.content}`);
  return `最近对话上下文：\n${lines.join("\n")}`;
}

function normalizeClassifierInput(
  input: string | ModelIntentClassifierInput
): ModelIntentClassifierInput {
  if (typeof input === "string") {
    return {
      query: input
    };
  }

  return input;
}

function formatSiliconFlowLog(message: string) {
  return `[siliconflow] ${message}`;
}

export function createModelIntentClassifier(
  input: CreateModelIntentClassifierInput
): ModelIntentClassifier {
  const requestFetch = input.fetch ?? fetch;
  const baseUrl = input.baseUrl.replace(/\/$/, "");

  return {
    async classify(rawInput) {
      const normalizedInput = normalizeClassifierInput(rawInput);

      try {
        console.info(
          formatSiliconFlowLog(
            `request model="${input.model}" query="${normalizedInput.query}"`
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
            temperature: 0,
            response_format: {
              type: "json_object"
            },
            messages: [
              {
                role: "system",
                content: [
                  "你是企业员工助手的决策引擎，只能输出 JSON。",
                  'mode 只能是 knowledge、task、chat、clarify 其中之一。',
                  "请结合最近对话上下文判断是否发生了话题切换。",
                  "低置信度时不要硬判，应该返回 clarify。",
                  "needKnowledge 和 needTaskResolution 用于告诉系统是否要调用工具。"
                ].join("\n")
              },
              {
                role: "user",
                content: [
                  formatConversationContext(
                    normalizedInput.conversationContext ?? []
                  ),
                  `当前用户消息：${normalizedInput.query}`,
                  "请直接返回 JSON 决策结果，不要输出额外解释。"
                ].join("\n\n")
              }
            ]
          })
        });

        if (!response.ok) {
          return buildFallbackDecision();
        }

        const payload = (await response.json()) as {
          choices?: Array<{
            message?: {
              content?: string;
            };
          }>;
        };

        const decision = extractDecisionFromContent(
          payload.choices?.[0]?.message?.content ?? ""
        );

        console.info(
          formatSiliconFlowLog(
            `response mode=${decision.mode} query="${normalizedInput.query}"`
          )
        );

        return decision;
      } catch {
        // 模型调用属于决策层能力；一旦异常，直接回到轻量澄清，
        // 让用户能继续对话，而不是被网络抖动打断整条链路。
        const reason = "network down";
        console.warn(
          formatSiliconFlowLog(
            `response mode=clarify query="${normalizedInput.query}" reason="${reason}"`
          )
        );

        return buildFallbackDecision();
      }
    }
  };
}

export { buildFallbackDecision, DEFAULT_CLARIFY_QUESTION };
