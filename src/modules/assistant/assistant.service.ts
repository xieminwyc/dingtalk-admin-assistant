import { randomUUID } from "node:crypto";

import type { EntryMode } from "./entry-mode.types";
import type { IntentAnalyzer } from "../intents/intent-analyzer";
import type { IntentAnalysis } from "../intents/intent-analyzer";
import type { ConversationContextTurn } from "../logging/conversation-context.service";
import type { ConversationLogRepositoryLike } from "../logging/conversation-log.types";
import type { KnowledgeRetriever } from "../knowledge/retriever.types";
import { buildAssistantReply } from "./reply-builder";
import type { AssistantResolution } from "./assistant.types";
import type { ResponseGenerator } from "./response-generator";
import {
  buildClarificationResolution,
  createRequestRouter,
  type ContactDirectoryResolver,
  type TaskCatalogResolver,
} from "../router/request-router";

export type AssistantReplyInput = {
  query: string;
  sessionId?: string;
  conversationId?: string;
  userId?: string;
  entryMode?: EntryMode;
};

export type AssistantDebugReply = {
  reply: string;
  conversationContext: ConversationContextTurn[];
  intent: IntentAnalysis;
  resolution: AssistantResolution;
  usedResponseGenerator: boolean;
};

type ConversationContextLoader = {
  loadRecentContext(
    sessionId: string,
    options: { maxTurns?: number; ttlMs?: number },
  ): Promise<ConversationContextTurn[]>;
};

const DEFAULT_CONTEXT_TTL_MS = 30 * 60 * 1000;
const DEFAULT_CONTEXT_TURNS = 6;

function normalizeReplyInput(
  input: string | AssistantReplyInput,
): AssistantReplyInput {
  if (typeof input === "string") {
    return {
      query: input,
    };
  }

  return input;
}

function buildDefaultIntentAnalysis(): IntentAnalysis {
  return {
    mode: "internal_knowledge",
    intentConfidence: 1,
    needKnowledge: true,
    needTaskResolution: false,
    toolPlan: "knowledge",
    topicShift: false,
    intent: "knowledge_query",
    source: "fallback",
  };
}

function buildClarificationIntentAnalysis(): IntentAnalysis {
  return {
    mode: "clarify",
    intentConfidence: 0,
    needKnowledge: false,
    needTaskResolution: false,
    toolPlan: "none",
    topicShift: false,
    intent: "unknown",
    source: "fallback",
  };
}

export function createAssistantService(input: {
  localRetriever: KnowledgeRetriever;
  // service 只依赖最小解析接口，避免把编排层绑死在具体目录实现上。
  taskCatalog: TaskCatalogResolver;
  contactDirectory?: ContactDirectoryResolver;
  externalRetriever?: KnowledgeRetriever;
  enableExternalKnowledge?: boolean;
  corpId?: string;
  analyzer?: IntentAnalyzer;
  conversationContextService?: ConversationContextLoader;
  conversationLogger?: Pick<ConversationLogRepositoryLike, "append">;
  responseGenerator?: ResponseGenerator;
}) {
  const router = createRequestRouter({
    localRetriever: input.localRetriever,
    taskCatalog: input.taskCatalog,
    contactDirectory: input.contactDirectory,
    externalRetriever: input.externalRetriever,
    enableExternalKnowledge: input.enableExternalKnowledge,
    corpId: input.corpId,
  });

  async function loadConversationContext(
    sessionId?: string,
  ): Promise<ConversationContextTurn[]> {
    if (!sessionId || !input.conversationContextService) {
      return [];
    }

    try {
      return await input.conversationContextService.loadRecentContext(
        sessionId,
        {
          maxTurns: DEFAULT_CONTEXT_TURNS,
          ttlMs: DEFAULT_CONTEXT_TTL_MS,
        },
      );
    } catch {
      // 上下文读取失败时不应阻塞当前回复；
      // 这时直接退化成“单轮消息”即可。
      return [];
    }
  }

  async function appendConversationLog(inputRecord: {
    sessionId?: string;
    conversationId?: string;
    userId?: string;
    query: string;
    content: string;
    role: "user" | "assistant";
    routeType: IntentAnalysis["intent"];
    routeConfidence?: number;
  }) {
    if (!inputRecord.sessionId || !input.conversationLogger) {
      return;
    }

    try {
      await input.conversationLogger.append({
        conversationId: inputRecord.conversationId ?? inputRecord.sessionId,
        sessionId: inputRecord.sessionId,
        messageId: randomUUID(),
        userId: inputRecord.userId ?? "anonymous-user",
        query: inputRecord.query,
        content: inputRecord.content,
        role: inputRecord.role,
        routeType: inputRecord.routeType,
        routeConfidence: inputRecord.routeConfidence,
      });
    } catch {
      // 日志只承担观测与上下文回放能力，不应该反向影响用户当前会话。
    }
  }

  async function resolveReply(
    rawInput: string | AssistantReplyInput,
  ): Promise<AssistantDebugReply> {
    const replyInput = normalizeReplyInput(rawInput);
    const conversationContext = await loadConversationContext(
      replyInput.sessionId,
    );
    let intent: IntentAnalysis | null = null;

    if (input.analyzer) {
      try {
        intent = await input.analyzer.analyze({
          query: replyInput.query,
          conversationContext,
          entryMode: replyInput.entryMode,
        });
      } catch {
        // analyzer 失效时不继续猜测路由，直接返回保守澄清，
        // 避免把分类异常放大成错误答案或错误入口。
        const fallbackResolution = buildClarificationResolution();

        return {
          reply: buildAssistantReply(fallbackResolution),
          conversationContext,
          intent: buildClarificationIntentAnalysis(),
          resolution: fallbackResolution,
          usedResponseGenerator: false,
        };
      }
    }

    // assistant service 自己不判断知识/事务/人工，
    // 它只负责串起“分析意图 -> 路由 -> 拼回复”的主流程。
    // 未接分析器时，默认按知识问答路径走，兼容现有单一路径调用方。
    const resolvedIntent = intent ?? buildDefaultIntentAnalysis();

    if (resolvedIntent.mode === "open_response" && resolvedIntent.reply?.trim()) {
      const resolution: AssistantResolution = {
        kind: "open_response",
        intent: "smalltalk",
        reply: resolvedIntent.reply,
      };
      const reply = resolvedIntent.reply;

      await appendConversationLog({
        sessionId: replyInput.sessionId,
        conversationId: replyInput.conversationId,
        userId: replyInput.userId,
        query: replyInput.query,
        content: replyInput.query,
        role: "user",
        routeType: resolvedIntent.intent,
        routeConfidence: resolvedIntent.intentConfidence,
      });
      await appendConversationLog({
        sessionId: replyInput.sessionId,
        conversationId: replyInput.conversationId,
        userId: replyInput.userId,
        query: replyInput.query,
        content: reply,
        role: "assistant",
        routeType: resolution.intent,
        routeConfidence: resolvedIntent.intentConfidence,
      });

      return {
        reply,
        conversationContext,
        intent: resolvedIntent,
        resolution,
        usedResponseGenerator: false,
      };
    }

    const resolution = await router.route({
      query: replyInput.query,
      entryMode: replyInput.entryMode,
      intent: resolvedIntent,
      // taskHint 是决策器给事务 provider 的结构化提示，
      // 现在先直接透传给旧 router，帮助事务命中更稳定。
      taskType: resolvedIntent.taskHint,
      userId: replyInput.userId,
      sessionId: replyInput.sessionId,
    });
    // Если我们已经在使用外部大模型直接出 answer (source === 'rag')，
    // 我们就不再走一遍内部大模型润色，避免重复花时间和费用，以及冲掉外脑原意。
    const shouldSkipGeneration =
      resolution.kind === "knowledge" && resolution.source === "rag";

    const generatedReply =
      input.responseGenerator && !shouldSkipGeneration
        ? await input.responseGenerator.generate({
            query: replyInput.query,
            entryMode: replyInput.entryMode,
            conversationContext,
            resolution,
          })
        : null;

    const reply = generatedReply ?? buildAssistantReply(resolution);

    await appendConversationLog({
      sessionId: replyInput.sessionId,
      conversationId: replyInput.conversationId,
      userId: replyInput.userId,
      query: replyInput.query,
      content: replyInput.query,
      role: "user",
      routeType: resolvedIntent.intent,
      routeConfidence: resolvedIntent.intentConfidence,
    });
    await appendConversationLog({
      sessionId: replyInput.sessionId,
      conversationId: replyInput.conversationId,
      userId: replyInput.userId,
      query: replyInput.query,
      content: reply,
      role: "assistant",
      routeType: resolution.intent,
      routeConfidence: resolvedIntent.intentConfidence,
    });

    return {
      reply,
      conversationContext,
      intent: resolvedIntent,
      resolution,
      usedResponseGenerator: Boolean(generatedReply),
    };
  }

  return {
    async reply(rawInput: string | AssistantReplyInput) {
      const result = await resolveReply(rawInput);

      return result.reply;
    },
    async replyWithDebug(rawInput: string | AssistantReplyInput) {
      return resolveReply(rawInput);
    },
  };
}
