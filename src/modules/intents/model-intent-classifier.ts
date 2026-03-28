import type { IntentType } from "./intent.types";

export type ModelIntentClassifier = {
  classify(query: string): Promise<IntentType>;
};

type CreateModelIntentClassifierInput = {
  apiKey: string;
  baseUrl: string;
  model: string;
  fetch?: typeof fetch;
};

const SUPPORTED_INTENTS: IntentType[] = [
  "knowledge_query",
  "task_request",
  "handoff_request",
  "smalltalk",
  "unknown",
];

function isIntentType(value: unknown): value is IntentType {
  return SUPPORTED_INTENTS.includes(value as IntentType);
}

function extractIntentFromContent(content: string): IntentType {
  try {
    const parsed = JSON.parse(content) as { intent?: unknown };

    if (isIntentType(parsed.intent)) {
      return parsed.intent;
    }
  } catch {
    // 模型偶发返回非 JSON 时，统一回落成 unknown，避免误判。
  }

  return "unknown";
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
    async classify(query: string) {
      try {
        console.info(
          formatSiliconFlowLog(
            `request model="${input.model}" query="${query}"`
          )
        );

        const response = await requestFetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${input.apiKey}`,
          },
          body: JSON.stringify({
            model: input.model,
            temperature: 0,
            response_format: {
              type: "json_object",
            },
            messages: [
              {
                role: "system",
                content:
                  '你是企业行政助手的意图分类器。只能输出 JSON，例如 {"intent":"knowledge_query"}。',
              },
              {
                role: "user",
                content: `请只判断这句话的意图：${query}`,
              },
            ],
          }),
        });

        if (!response.ok) {
          return "unknown";
        }

        const payload = (await response.json()) as {
          choices?: Array<{
            message?: {
              content?: string;
            };
          }>;
        };

        const intent = extractIntentFromContent(
          payload.choices?.[0]?.message?.content ?? ""
        );

        console.info(
          formatSiliconFlowLog(`response intent=${intent} query="${query}"`)
        );

        return intent;
      } catch {
        // 模型调用属于兜底能力，异常时不能反向打断用户请求。
        const reason = "network down";
        console.warn(
          formatSiliconFlowLog(
            `response intent=unknown query="${query}" reason="${reason}"`
          )
        );

        return "unknown";
      }
    },
  };
}
