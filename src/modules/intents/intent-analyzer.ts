import type { IntentType } from "./intent.types";
import type { ModelIntentClassifier } from "./model-intent-classifier";

export type IntentAnalysis = {
  intent: IntentType;
  source: "rule" | "model";
};

export type IntentAnalyzer = {
  analyze(query: string): Promise<IntentAnalysis>;
};

type CreateIntentAnalyzerInput = {
  modelClassifier?: ModelIntentClassifier;
};

const SMALLTALK_PATTERN =
  /^(你好|您好|hi|hello|哈喽|嗨|早上好|中午好|下午好|晚上好)([呀啊吗嘛！!,.，。?？\s]*)$/i;
const HANDOFF_PATTERN = /(找(下)?行政|联系行政|转人工|找人工|找客服|人工处理)/;
const TASK_ENTITY_PATTERN = /(请假|补卡|报销|出差|入职|离职|审批|申请|行政)/;
const TASK_CUE_PATTERN =
  /(我要|我想|帮我|申请|办理|发起|提交|怎么|如何|入口|流程|审批)/;
const KNOWLEDGE_PATTERN = /(规则|制度|政策|规范|说明|是什么|什么意思|区别)/;

function classifyByRule(query: string): IntentType | null {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return "unknown";
  }

  if (SMALLTALK_PATTERN.test(normalizedQuery)) {
    return "smalltalk";
  }

  if (HANDOFF_PATTERN.test(normalizedQuery)) {
    return "handoff_request";
  }

  const hasTaskEntity = TASK_ENTITY_PATTERN.test(normalizedQuery);
  const hasTaskCue = TASK_CUE_PATTERN.test(normalizedQuery);
  const hasKnowledgeCue = KNOWLEDGE_PATTERN.test(normalizedQuery);

  // 事务词和知识词同时出现时，优先把“流程/入口/怎么做”判成办理诉求。
  if (hasTaskEntity && hasTaskCue) {
    return "task_request";
  }

  if (hasKnowledgeCue) {
    return "knowledge_query";
  }

  if (hasTaskEntity) {
    return "task_request";
  }

  return null;
}

export function createIntentAnalyzer(
  input: CreateIntentAnalyzerInput = {}
): IntentAnalyzer {
  return {
    async analyze(query: string) {
      const ruleIntent = classifyByRule(query);

      if (ruleIntent) {
        return {
          intent: ruleIntent,
          source: "rule"
        };
      }

      if (!input.modelClassifier) {
        return {
          intent: "unknown",
          source: "rule"
        };
      }

      return {
        intent: await input.modelClassifier.classify(query),
        source: "model"
      };
    }
  };
}
