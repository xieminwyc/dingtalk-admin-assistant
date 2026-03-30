import type { ConversationContextTurn } from "../logging/conversation-context.service";
import type { EntryMode } from "../assistant/entry-mode.types";
import type { IntentType } from "./intent.types";
import type { AssistantDecision } from "./intent.types";
import {
  buildFallbackDecision,
  type ModelIntentClassifier
} from "./model-intent-classifier";

export type IntentAnalysis = AssistantDecision & {
  // 这层 source 只用于调试与测试，方便区分“真实模型决策”还是“轻量降级”。
  source: "model" | "fallback";
  // 旧 router 还在读 intent 字段，这里先保留一层桥接映射，
  // 等后续任务把 route/reply 全切到 mode 后再删掉。
  intent: IntentType;
};

export type AnalyzeIntentInput = {
  query: string;
  conversationContext?: ConversationContextTurn[];
  entryMode?: EntryMode;
};

export type IntentAnalyzer = {
  analyze(input: string | AnalyzeIntentInput): Promise<IntentAnalysis>;
};

type CreateIntentAnalyzerInput = {
  modelClassifier?: ModelIntentClassifier;
};

function formatIntentLog(message: string) {
  return `[intent] ${message}`;
}

function mapModeToLegacyIntent(mode: AssistantDecision["mode"]): IntentType {
  switch (mode) {
    case "internal_knowledge":
      return "knowledge_query";
    case "task":
      return "task_request";
    case "open_response":
      return "smalltalk";
    case "clarify":
      return "unknown";
  }
}

function fallbackToolPlanByMode(mode: AssistantDecision["mode"]) {
  switch (mode) {
    case "internal_knowledge":
      return "knowledge";
    case "task":
      return "task";
    case "open_response":
    case "clarify":
      return "none";
  }
}

function normalizeAnalyzeInput(
  input: string | AnalyzeIntentInput
): AnalyzeIntentInput {
  if (typeof input === "string") {
    return {
      query: input
    };
  }

  return input;
}

function buildAnalysisResult(
  decision: AssistantDecision,
  source: IntentAnalysis["source"]
): IntentAnalysis {
  return {
    ...decision,
    toolPlan: decision.toolPlan ?? fallbackToolPlanByMode(decision.mode),
    source,
    intent: mapModeToLegacyIntent(decision.mode)
  };
}

export function createIntentAnalyzer(
  input: CreateIntentAnalyzerInput = {}
): IntentAnalyzer {
  return {
    async analyze(rawInput) {
      const normalizedInput = normalizeAnalyzeInput(rawInput);

      if (!input.modelClassifier) {
        const fallbackDecision = buildFallbackDecision();

        console.warn(
          formatIntentLog(
            `source=fallback mode=${fallbackDecision.mode} query="${normalizedInput.query}" reason="model unavailable"`
          )
        );

        return buildAnalysisResult(fallbackDecision, "fallback");
      }

      try {
        console.info(
          formatIntentLog(
            `source=model action=decide query="${normalizedInput.query}"`
          )
        );

        const decision = await input.modelClassifier.classify(normalizedInput);

        console.info(
          formatIntentLog(
            `source=model mode=${decision.mode} query="${normalizedInput.query}"`
          )
        );

        return buildAnalysisResult(decision, "model");
      } catch {
        // 这里不再退回本地规则，而是统一走轻量澄清；
        // 这样第二阶段的行为边界始终保持“模型主导，失败时保守追问”。
        const reason = "model failed";
        const fallbackDecision = buildFallbackDecision();

        console.warn(
          formatIntentLog(
            `source=fallback mode=${fallbackDecision.mode} query="${normalizedInput.query}" reason="${reason}"`
          )
        );

        return buildAnalysisResult(fallbackDecision, "fallback");
      }
    }
  };
}
