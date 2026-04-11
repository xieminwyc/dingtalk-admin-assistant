import type { ConversationContextTurn } from "../logging/conversation-context.service";
import type {
  AssistantDecision,
  AssistantMode,
  AssistantToolPlan,
} from "./intent.types";

export type ModelIntentClassifierInput = {
  query: string;
  conversationContext?: ConversationContextTurn[];
  imageUrl?: string;
  imageUrls?: string[];
};

export type ModelIntentClassifier = {
  classify(
    input: string | ModelIntentClassifierInput,
  ): Promise<AssistantDecision>;
};

type CreateModelIntentClassifierInput = {
  apiKey: string;
  baseUrl: string;
  model: string;
  fetch?: typeof fetch;
};

const SUPPORTED_MODES: AssistantMode[] = [
  "internal_knowledge",
  "task",
  "open_response",
  "clarify",
];
const DEFAULT_CLARIFY_QUESTION =
  "我先确认一下，你是想查制度说明，还是想办理流程？";
const DEFAULT_MODEL_ERROR_QUESTION = "当前系统开小差了，请稍后再试。";

function isAssistantMode(value: unknown): value is AssistantMode {
  return SUPPORTED_MODES.includes(value as AssistantMode);
}

function isAssistantToolPlan(value: unknown): value is AssistantToolPlan {
  return value === "none" || value === "knowledge" || value === "task";
}

function clampConfidence(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function fallbackToolUsageByMode(mode: AssistantMode): {
  needKnowledge: boolean;
  needTaskResolution: boolean;
  toolPlan: AssistantToolPlan;
} {
  return {
    needKnowledge: mode === "internal_knowledge",
    needTaskResolution: mode === "task",
    toolPlan:
      mode === "internal_knowledge"
        ? "knowledge"
        : mode === "task"
          ? "task"
          : "none",
  };
}

function buildFallbackDecision(input?: {
  clarifyQuestion?: string;
}): AssistantDecision {
  return {
    mode: "clarify",
    intentConfidence: 0,
    needKnowledge: false,
    needTaskResolution: false,
    toolPlan: "none",
    topicShift: false,
    clarifyQuestion: input?.clarifyQuestion ?? DEFAULT_CLARIFY_QUESTION,
  };
}

function buildModelErrorDecision(): AssistantDecision {
  return buildFallbackDecision({
    clarifyQuestion: DEFAULT_MODEL_ERROR_QUESTION,
  });
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
    const contextBreakConfidence =
      typeof parsed.contextBreakConfidence === "number"
        ? clampConfidence(parsed.contextBreakConfidence)
        : undefined;
    const clarifyQuestion =
      pickOptionalText(parsed.clarifyQuestion) ??
      (parsed.mode === "clarify" ? DEFAULT_CLARIFY_QUESTION : undefined);
    const knowledgeHint = pickOptionalText(parsed.knowledgeHint);
    const taskHint = pickOptionalText(parsed.taskHint);
    const reply =
      parsed.mode === "open_response" ? pickOptionalText(parsed.reply) : undefined;

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
      toolPlan: isAssistantToolPlan(parsed.toolPlan)
        ? parsed.toolPlan
        : fallbackUsage.toolPlan,
      topicShift: Boolean(parsed.topicShift),
      ...(contextBreakConfidence !== undefined
        ? { contextBreakConfidence }
        : {}),
      ...(clarifyQuestion ? { clarifyQuestion } : {}),
      ...(knowledgeHint ? { knowledgeHint } : {}),
      ...(taskHint ? { taskHint } : {}),
      ...(reply ? { reply } : {}),
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
  input: string | ModelIntentClassifierInput,
): ModelIntentClassifierInput {
  if (typeof input === "string") {
    return {
      query: input,
    };
  }

  return input;
}

function formatSiliconFlowLog(message: string) {
  return `[siliconflow] ${message}`;
}

function normalizeImageUrls(input: {
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

function buildDecisionSystemPrompt() {
  return [
    "你是企业员工助手的决策引擎，只能输出 JSON。",
    "mode 只能是 internal_knowledge、task、open_response、clarify 其中之一。",
    "toolPlan 只能是 none、knowledge、task 其中之一。",
    "意图判断只看用户当前想做什么，不要根据你自己是否知道答案来决定 mode。",
    "请结合最近对话上下文判断是否发生了话题切换。",
    "低置信度时不要硬判，应该返回 clarify。",
    "needKnowledge、needTaskResolution 和 toolPlan 用于告诉系统是否要调用工具。",
    "只有公司内部知识和公司事务才允许调用工具。",
    "如果是闲聊、天气、旅游、美食、生活常识、百科问答、攻略建议、图片识别、文字提取、针对图片内容的询问，应该判断为 open_response，并设置 toolPlan 为 none。",
    "如果用户上传了图片，请务必结合图片内容进行判断。如果图片中包含发票、医疗单据、合同、审批单、规则制度等公司相关内容，请尝试根据内容映射到 internal_knowledge 或 task。",
    "如果 mode 是 open_response，必须返回 reply 字段，内容是本轮可以直接发给用户的最终中文回复。",
    "open_response 的 reply 必须是有帮助的、正面的回答，禁止以“我是企业助手”或“无法查询”等理由拒绝作答。",
    "即使你没有实时数据（如天气、股价），也应该基于常识给出有参考价值的回答，可以附带建议用户查看权威渠道获取最新信息。",
    "如果 mode 不是 open_response，不要返回 reply 字段。",
    "禁止查阅公司内部知识库来回答通用知识或闲聊问题。",
    "询问公司规则、制度、说明、标准、口径、区别、适用范围，优先判断为 internal_knowledge。",
    "短的制度名词短语也优先判断为 internal_knowledge，例如：迟到扣款、病假工资、年假天数、餐补标准、加班调休、考勤制度。",
    "像“迟到扣款制度说明”“病假工资怎么算”“年假天数”“迟到打卡怎么算”这类表达，即使不是完整问句，也通常是在查制度知识。",
    "这类表达优先判断为 internal_knowledge，不要因为句子短就直接进入 clarify。",
    "不要因为自己不知道答案、知识库可能暂时没有命中、或者制度细节可能因公司而异，就把本来是知识查询的问题判成 clarify。",
    "像“报销流程是什么”“报销流程说明”“请假流程是什么”这类问法，重点是在问制度或流程说明，优先判断为 internal_knowledge，而不是 task。",
    "像“OA 费用报销申请怎么填”“报销单怎么写”“考勤异常怎么填”这类在问公司表单、制度口径、内部流程细节的表达，也优先判断为 internal_knowledge。",
    "如果最近对话上下文已经在讨论公司制度或流程，用户继续追问“那上班时间呢”“那餐补呢”“那考勤呢”这类短句时，优先判断为 internal_knowledge，而不是 open_response。",
    "只有当用户明确要你代办、发起、申请、提交、办理某个事项时，才判断为 task。",
    "如果用户是在要通用信息或开放回答，例如“北京七日游攻略”“深圳天气怎么样”“番茄炒蛋怎么做”，应该判断为 open_response，而不是 internal_knowledge。",
    "只有当用户指代不明、问题目标不清晰、或者同一句话可能同时落入多种模式且没有足够上下文时，才返回 clarify。",
    "只有在你无法判断用户是在查内部制度、办事务还是开放式回答时，才返回 clarify。",
    "few-shot 示例：",
    '用户：“迟到扣款” -> {"mode":"internal_knowledge","intentConfidence":0.9,"needKnowledge":true,"needTaskResolution":false,"toolPlan":"knowledge","topicShift":false,"knowledgeHint":"迟到扣款制度"}',
    '用户：“迟到打卡怎么算” -> {"mode":"internal_knowledge","intentConfidence":0.92,"needKnowledge":true,"needTaskResolution":false,"toolPlan":"knowledge","topicShift":false,"knowledgeHint":"迟到打卡制度"}',
    '用户：“迟到扣款制度说明” -> {"mode":"internal_knowledge","intentConfidence":0.92,"needKnowledge":true,"needTaskResolution":false,"toolPlan":"knowledge","topicShift":false,"knowledgeHint":"迟到扣款制度"}',
    '用户：“病假工资” -> {"mode":"internal_knowledge","intentConfidence":0.9,"needKnowledge":true,"needTaskResolution":false,"toolPlan":"knowledge","topicShift":false,"knowledgeHint":"病假工资制度"}',
    '用户：“报销流程是什么” -> {"mode":"internal_knowledge","intentConfidence":0.92,"needKnowledge":true,"needTaskResolution":false,"toolPlan":"knowledge","topicShift":false,"knowledgeHint":"报销流程"}',
    '用户：“报销流程说明” -> {"mode":"internal_knowledge","intentConfidence":0.92,"needKnowledge":true,"needTaskResolution":false,"toolPlan":"knowledge","topicShift":false,"knowledgeHint":"报销流程"}',
    '用户：“OA 费用报销申请怎么填” -> {"mode":"internal_knowledge","intentConfidence":0.93,"needKnowledge":true,"needTaskResolution":false,"toolPlan":"knowledge","topicShift":false,"knowledgeHint":"OA 费用报销申请怎么填"}',
    '上下文：user: 报销流程是什么 assistant: 我找到了报销流程制度说明。 用户：“那上班时间呢” -> {"mode":"internal_knowledge","intentConfidence":0.86,"needKnowledge":true,"needTaskResolution":false,"toolPlan":"knowledge","topicShift":false,"knowledgeHint":"上班时间"}',
    '用户：“我要请假” -> {"mode":"task","intentConfidence":0.95,"needKnowledge":false,"needTaskResolution":true,"toolPlan":"task","topicShift":false,"taskHint":"leave_application"}',
    '用户：“你好” -> {"mode":"open_response","intentConfidence":0.98,"needKnowledge":false,"needTaskResolution":false,"toolPlan":"none","topicShift":false,"reply":"你好，我是你的员工助手。你可以问我制度规则、办理入口，或者直接告诉我你想办什么。"}',
    '用户：“你是谁” -> {"mode":"open_response","intentConfidence":0.95,"needKnowledge":false,"needTaskResolution":false,"toolPlan":"none","topicShift":false,"reply":"你好，我是你的员工助手，主要可以帮你查公司制度、找办理入口，也可以先帮你判断问题该查知识还是走流程。"}',
    '用户：“你能做什么” -> {"mode":"open_response","intentConfidence":0.97,"needKnowledge":false,"needTaskResolution":false,"toolPlan":"none","topicShift":false,"reply":"我可以帮你查公司制度说明、找常用办理入口，也可以先帮你判断问题该查知识还是走流程。"}',
    '用户：“北京七日游攻略” -> {"mode":"open_response","intentConfidence":0.94,"needKnowledge":false,"needTaskResolution":false,"toolPlan":"none","topicShift":false,"reply":"如果你想轻松一点，我建议按故宫、中轴线、长城、颐和园、胡同这样安排。"}',
    '用户：“今天天气怎么样” -> {"mode":"open_response","intentConfidence":0.95,"needKnowledge":false,"needTaskResolution":false,"toolPlan":"none","topicShift":false,"reply":"我作为企业助手没有接入实时天气数据，你可以看下手机上的天气预报，记得注意防寒保暖。"}',
    '用户：“这个怎么办” -> {"mode":"clarify","intentConfidence":0.3,"needKnowledge":false,"needTaskResolution":false,"toolPlan":"none","topicShift":false,"clarifyQuestion":"你是想查制度说明，还是想办理流程？"}',
  ].join("\n");
}

export function createModelIntentClassifier(
  input: CreateModelIntentClassifierInput,
): ModelIntentClassifier {
  const requestFetch = input.fetch ?? fetch;
  const baseUrl = input.baseUrl.replace(/\/$/, "");

  return {
    async classify(rawInput) {
      const normalizedInput = normalizeClassifierInput(rawInput);
      const imageUrls = normalizeImageUrls(normalizedInput);

      try {
        console.info(
          formatSiliconFlowLog(
            `request model="${input.model}" query="${normalizedInput.query}" hasImage=${imageUrls.length > 0}`,
          ),
        );

        let userContent: any = [
          formatConversationContext(
            normalizedInput.conversationContext ?? [],
          ),
          `当前用户消息：${normalizedInput.query}`,
          imageUrls.length > 0
            ? `注意：用户还上传了 ${imageUrls.length} 张图片，请结合图片内容进行判断。`
            : undefined,
          "请直接返回 JSON 决策结果，不要输出额外解释。",
        ].filter(Boolean).join("\n\n");

        if (imageUrls.length > 0) {
          userContent = [
            { type: "text", text: userContent },
            ...imageUrls.map((imageUrl) => ({
              type: "image_url",
              image_url: { url: imageUrl },
            })),
          ];
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s 决策层超时

        const response = await requestFetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${input.apiKey}`,
          },
          body: JSON.stringify({
            model: input.model,
            temperature: 0,
            ...(imageUrls.length > 0
              ? {}
              : {
                  response_format: {
                    type: "json_object",
                  },
                }),
            messages: [
              {
                role: "system",
                content: buildDecisionSystemPrompt(),
              },
              {
                role: "user",
                content: userContent,
              },
            ],
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorBody = await response.text().catch(() => "(failed to read body)");
          clearTimeout(timeoutId);
          const reason = `${response.status} ${response.statusText}`.trim();
          console.error(
            formatSiliconFlowLog(
              `API ERROR: status=${reason} body=${errorBody} query="${normalizedInput.query}"`,
            ),
          );

          return buildModelErrorDecision();
        }

        const payload = (await response.json()) as {
          choices?: Array<{
            message?: {
              content?: string;
            };
          }>;
          error?: {
            message?: string;
          };
        };

        clearTimeout(timeoutId);

        if (payload.error) {
           console.error(
            formatSiliconFlowLog(
              `MODEL ERROR: ${JSON.stringify(payload.error)} query="${normalizedInput.query}"`,
            ),
          );
          return buildModelErrorDecision();
        }

        const content = payload.choices?.[0]?.message?.content ?? "";
        
        if (!content) {
          console.warn(
            formatSiliconFlowLog(
              `EMPTY CONTENT: model returned no content for query="${normalizedInput.query}"`,
            ),
          );
        }

        const decision = extractDecisionFromContent(content);

        console.info(
          formatSiliconFlowLog(
            `response mode=${decision.mode} query="${normalizedInput.query}" content="${content.replace(/\n/g, "\\n")}"`,
          ),
        );

        return decision;
      } catch (error) {
        // 模型调用属于决策层能力；一旦异常，直接返回友好报错，
        // 避免把服务异常伪装成“继续追问用户”。
        const reason =
          error instanceof Error ? error.message : String(error);
        console.warn(
          formatSiliconFlowLog(
            `response mode=clarify query="${normalizedInput.query}" reason="${reason}"`,
          ),
        );

        return buildModelErrorDecision();
      }
    },
  };
}

export {
  buildFallbackDecision,
  buildModelErrorDecision,
  DEFAULT_CLARIFY_QUESTION,
  DEFAULT_MODEL_ERROR_QUESTION,
};
