import type { ConversationContextTurn } from "../logging/conversation-context.service";

import type { AssistantDecision } from "./intent.types";

type AnalyzeIntentLikeInput = {
  query: string;
  conversationContext?: ConversationContextTurn[];
};

export function buildKnowledgeHint(query: string) {
  return (
    query
      .trim()
      .replace(/[？?。！!]/g, "")
      .replace(/^(那|那么|那如果|那像|那像是|这个|这个的话|那这个|关于|那关于)/u, "")
      .trim()
      .replace(
        /(是什么|是啥|什么意思|什么含义|怎么理解|说明|规则|标准|口径|区别|适用范围|呢)$/u,
        "",
      )
      .trim() || query.trim()
  );
}

export function looksLikeCompanyKnowledgeQuery(query: string) {
  const normalizedQuery = query.trim().replace(/\s+/g, "");
  const companyKnowledgeKeywords =
    /(OA|报销|报销单|费用报销|发票|审批|考勤|考勤异常|打卡|迟到|早退|上班时间|下班时间|工时|请假|年假|病假|调休|加班|餐补|补贴|福利|工资|社保|公积金|出差|住宿标准|入职|离职|工牌|门禁|办公用品|制度|规则|标准|流程|说明|须知)/u;
  const knowledgeQuestionPattern =
    /(怎么填|怎么写|怎么算|怎么申请|怎么报|怎么走|是什么|是啥|几点|时间|标准|规则|制度|流程|说明|口径|区别|适用范围|如何)/u;

  return (
    companyKnowledgeKeywords.test(normalizedQuery) &&
    knowledgeQuestionPattern.test(normalizedQuery)
  );
}

export function isShortKnowledgeFollowUp(
  query: string,
  conversationContext: ConversationContextTurn[] = [],
) {
  const normalizedQuery = query.trim().replace(/[？?。！!]/g, "");
  const followUpPrefix = /^(那|那么|那如果|那这个|这个|那边|还有|以及)/u;
  const companyKnowledgeKeywords =
    /(上班时间|下班时间|考勤|考勤异常|打卡|迟到|早退|工时|餐补|补贴|报销|请假|年假|病假|调休|加班|工资|福利|社保|公积金|审批|流程|标准|规则|制度)/u;
  const knowledgeContextMarkers =
    /(制度|规则|标准|流程|说明|须知|口径|依据|文档|手册|按制度|怎么规定|怎么要求)/u;
  const recentKnowledgeContext = conversationContext.some((turn) =>
    knowledgeContextMarkers.test(turn.content),
  );

  return (
    normalizedQuery.length <= 12 &&
    followUpPrefix.test(normalizedQuery) &&
    companyKnowledgeKeywords.test(normalizedQuery) &&
    recentKnowledgeContext
  );
}

export function shouldReclassifyTaskAsKnowledge(
  query: string,
  decision: AssistantDecision,
) {
  if (decision.mode !== "task") {
    return false;
  }

  const normalizedQuery = query.trim().replace(/\s+/g, "");
  const descriptiveSuffix =
    /(是什么|是啥|什么意思|什么含义|怎么理解|说明|规则|标准|口径|区别|适用范围)[？?。！!]*$/u;
  const actionIntent =
    /^(我要|我想|帮我|给我|去|发起|提交|申请|办理|开通|创建|新增)/u;

  return (
    descriptiveSuffix.test(normalizedQuery) && !actionIntent.test(normalizedQuery)
  );
}

export function shouldReclassifyOpenResponseAsKnowledge(
  input: AnalyzeIntentLikeInput,
  decision: AssistantDecision,
) {
  if (decision.mode !== "open_response" || decision.topicShift) {
    return false;
  }

  return (
    looksLikeCompanyKnowledgeQuery(input.query) ||
    isShortKnowledgeFollowUp(input.query, input.conversationContext)
  );
}
