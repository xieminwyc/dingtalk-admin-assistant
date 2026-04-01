import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { z } from "zod";

import { createAssistantService } from "@/modules/assistant/assistant.service";
import { createResponseGenerator } from "@/modules/assistant/response-generator";
import { ContactDirectoryService } from "@/modules/contacts/contact-directory.service";
import { sampleContactDirectory } from "@/modules/contacts/sample-contact-directory";
import { createIntentAnalyzer } from "@/modules/intents/intent-analyzer";
import {
  createModelIntentClassifier,
  type ModelIntentClassifier,
} from "@/modules/intents/model-intent-classifier";
import { KnowledgeApiClient } from "@/modules/knowledge/knowledge-api-client";
import { ConversationContextService } from "@/modules/logging/conversation-context.service";
import { ConversationLogRepository } from "@/modules/logging/conversation-log.repository";
import {
  ExternalRagRetriever,
  type ExternalRagDocument,
  type ExternalRagProvider,
} from "@/modules/knowledge/external-rag-retriever";
import { KnowledgeCardRetriever } from "@/modules/knowledge/knowledge-card-retriever";
import { LocalDocumentRetriever } from "@/modules/knowledge/local-document-retriever";
import { sampleKnowledgeCards } from "@/modules/knowledge/sample-knowledge-cards";
import type { KnowledgeRetriever } from "@/modules/knowledge/retriever.types";
import { sampleTaskCatalog } from "@/modules/tasks/sample-task-catalog";
import { TaskCatalogService } from "@/modules/tasks/task-catalog.service";

type RuntimeEnvInput = Partial<Record<string, string | undefined>>;

type CreateAssistantRuntimeInput = {
  env?: RuntimeEnvInput;
  fetch?: typeof fetch;
  knowledgeDocsDir?: string;
  corpId?: string;
};

type AssistantRuntime = {
  assistant: ReturnType<typeof createAssistantService>;
  analyzer: ReturnType<typeof createIntentAnalyzer>;
  modelClassifier?: ModelIntentClassifier;
  responseGenerator?: ReturnType<typeof createResponseGenerator>;
  localRetriever: KnowledgeRetriever;
  externalRetriever?: KnowledgeRetriever;
  taskCatalog: TaskCatalogService;
  contactDirectory: ContactDirectoryService;
  conversationLogger: ConversationLogRepository;
  conversationContextService: ConversationContextService;
};

const runtimeEnvSchema = z.object({
  RAG_API_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional(),
  ),
  RAG_API_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  RAG_API_TIMEOUT: z.preprocess(
    (value) => value ? parseInt(value, 10) : undefined,
    z.number().min(1000).max(120000).optional(),
  ),
  RAG_API_RETRY_COUNT: z.preprocess(
    (value) => value ? parseInt(value, 10) : undefined,
    z.number().min(0).max(5).optional(),
  ),
  SILICONFLOW_API_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  SILICONFLOW_BASE_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional(),
  ),
  SILICONFLOW_MODEL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
});

type RuntimeEnv = {
  ragApiUrl?: string;
  ragApiKey?: string;
  ragApiTimeout?: number;
  ragApiRetryCount?: number;
  siliconflowApiKey?: string;
  siliconflowBaseUrl?: string;
  siliconflowModel?: string;
};

function normalizeQuery(query: string) {
  return query.trim().replace(/[？?！!。,.，]/g, "");
}

function buildKnowledgeFallbackQueries(query: string) {
  const normalized = normalizeQuery(query);
  const candidates = new Set<string>([normalized]);

  // 知识卡当前是精确命中，这里只做轻量去壳：
  // 把“是什么/是啥/怎么规定”这类问句尾巴裁掉，尽量回到知识标题本身。
  candidates.add(
    normalized
      .replace(/(是什么|是啥|什么意思|怎么规定|怎么办|怎么申请)$/u, "")
      .replace(/(规则|制度|政策|规范)(是什么)$/u, "$1")
      .trim(),
  );

  return [...candidates].filter(Boolean);
}

function buildDefaultKnowledgeDocsDir() {
  return resolve(process.cwd(), "docs/knowledge");
}

function createLocalKnowledgeRetriever(input?: {
  knowledgeDocsDir?: string;
}): KnowledgeRetriever {
  const cardRetriever = new KnowledgeCardRetriever(sampleKnowledgeCards);
  const knowledgeDocsDir =
    input?.knowledgeDocsDir ?? buildDefaultKnowledgeDocsDir();
  const documentRetriever = existsSync(knowledgeDocsDir)
    ? new LocalDocumentRetriever(knowledgeDocsDir)
    : null;

  return {
    async search(query, options) {
      let fallbackKeywords: string[] = [];

      if (documentRetriever) {
        // 本地联调阶段优先读 docs/knowledge 里的真实制度文档，
        // 只有文档没命中时，才退回样例知识卡，方便你逐步替换掉旧 demo 数据。
        const documentResult = await documentRetriever.search(query, options);

        if (documentResult.hits.length > 0) {
          return documentResult;
        }

        if (documentResult.relatedKeywords.length > 0) {
          fallbackKeywords = documentResult.relatedKeywords;
        }
      }

      for (const candidate of buildKnowledgeFallbackQueries(query)) {
        const result = await cardRetriever.search(candidate, options);

        if (result.hits.length > 0) {
          return result;
        }

        if (
          fallbackKeywords.length === 0 &&
          result.relatedKeywords.length > 0
        ) {
          fallbackKeywords = result.relatedKeywords;
        }
      }

      return {
        hits: [],
        relatedKeywords: fallbackKeywords,
      };
    },
  };
}

function isModelClassifierEnabled(env: ReturnType<typeof parseRuntimeEnv>) {
  return Boolean(
    env.siliconflowApiKey && env.siliconflowBaseUrl && env.siliconflowModel,
  );
}

function parseRuntimeEnv(envInput: RuntimeEnvInput = process.env) {
  // runtime helper 只解析自己真正关心的可选依赖，
  // 避免被全局 env schema 的其他必填项意外牵连。
  const parsed = runtimeEnvSchema.parse({
    RAG_API_URL: envInput.RAG_API_URL,
    RAG_API_KEY: envInput.RAG_API_KEY,
    RAG_API_TIMEOUT: envInput.RAG_API_TIMEOUT,
    RAG_API_RETRY_COUNT: envInput.RAG_API_RETRY_COUNT,
    SILICONFLOW_API_KEY: envInput.SILICONFLOW_API_KEY,
    SILICONFLOW_BASE_URL: envInput.SILICONFLOW_BASE_URL,
    SILICONFLOW_MODEL: envInput.SILICONFLOW_MODEL,
  });

  return {
    ragApiUrl: parsed.RAG_API_URL,
    ragApiKey: parsed.RAG_API_KEY,
    ragApiTimeout: parsed.RAG_API_TIMEOUT,
    ragApiRetryCount: parsed.RAG_API_RETRY_COUNT,
    siliconflowApiKey: parsed.SILICONFLOW_API_KEY,
    siliconflowBaseUrl: parsed.SILICONFLOW_BASE_URL,
    siliconflowModel: parsed.SILICONFLOW_MODEL,
  } satisfies RuntimeEnv;
}

function mapExternalRagDocuments(payload: unknown): ExternalRagDocument[] {
  if (
    payload &&
    typeof payload === "object" &&
    "items" in payload &&
    Array.isArray(payload.items)
  ) {
    return payload.items.map((item: any) => ({
      id: String(item.chunkId || item.id),
      title: item.title,
      content: item.chunkText || item.content,
      score: item.score,
      url: item.sourceUrl || item.url,
      headingPath: item.headingPath,
    }));
  }

  // Fallback map format if standard format failed
  // For backwards compatibility or different provider
  if (Array.isArray(payload)) {
    return payload as ExternalRagDocument[];
  }

  if (
    payload &&
    typeof payload === "object" &&
    "documents" in payload &&
    Array.isArray(payload.documents)
  ) {
    return payload.documents as ExternalRagDocument[];
  }

  return [];
}

// 在内容内存里持有一份钉钉会话 ID -> 知识库真实 Session ID 的映射
const ragSessionMap = new Map<string, string>();

export function createExternalRagProvider(input: {
  ragApiUrl: string;
  ragApiKey?: string;
  fetchImpl: typeof fetch;
  timeout?: number;
  retryCount?: number;
}): ExternalRagProvider {
  const apiClient = new KnowledgeApiClient({
    baseUrl: input.ragApiUrl,
    apiKey: input.ragApiKey,
    fetchImpl: input.fetchImpl,
    timeout: input.timeout ?? 30000, // 默认30秒
    retryCount: input.retryCount ?? 1, // 默认重试1次
  });

  return {
    async search({ query, department, userId, sessionId }) {
      try {
        // 如果我们本地记录了该钉钉会话对应的知识库 session，就传给它以维持上下文
        const ragSessionId = ragSessionMap.get(sessionId || "") || undefined;

        // 使用 /ask 接口，完全让外部 RAG 服务执行检索加答案生成
        const response = await apiClient.ask({
          question: query,
          operatorId: userId || "unknown",
          // 首次提问不传，后续从 map 里取出来传
          sessionId: ragSessionId,
          maxChunks: 5,
        });

        // 记下服务端为其创建的 session 关系，供后续追问使用
        if (response.sessionId && sessionId) {
          ragSessionMap.set(sessionId, response.sessionId);
        }

        // 既然我们已经全面转用自带答复能力的 /ask 接口，直接提取最终 answer 
        if (!response.answer) {
          return [];
        }

        const mainCitation = response.sources?.[0];
        return [
          {
            id: response.sessionId || sessionId || String(Date.now()),
            title: mainCitation?.documentTitle || "",
            content: response.answer,
            score: 1.0, 
            url: mainCitation?.sourceUrl,
            headingPath: mainCitation?.headingPath,
          },
        ];
      } catch (error: any) {
        console.error("[ExternalRagProvider] search error:", error);
        // 对于超时错误，返回空数组而不是抛出错误，让系统降级到本地知识库
        if (error.message.includes('超时') || error.message.includes('timeout')) {
          console.warn(`[ExternalRagProvider] 搜索超时，降级到本地知识库: ${query}`);
          return [];
        }
        // 其他错误仍然抛出
        throw error;
      }
    },
  };
}

export function createAssistantRuntime(
  input: CreateAssistantRuntimeInput = {},
): AssistantRuntime {
  const env = parseRuntimeEnv(input.env);
  const localRetriever = createLocalKnowledgeRetriever({
    knowledgeDocsDir: input.knowledgeDocsDir,
  });
  const taskCatalog = new TaskCatalogService(sampleTaskCatalog);
  const contactDirectory = new ContactDirectoryService(sampleContactDirectory);
  const conversationLogger = new ConversationLogRepository();
  const conversationContextService = new ConversationContextService(
    conversationLogger,
  );

  const modelClassifier = isModelClassifierEnabled(env)
    ? createModelIntentClassifier({
        apiKey: env.siliconflowApiKey!,
        baseUrl: env.siliconflowBaseUrl!,
        model: env.siliconflowModel!,
        fetch: input.fetch,
      })
    : undefined;
  const responseGenerator = isModelClassifierEnabled(env)
    ? createResponseGenerator({
        apiKey: env.siliconflowApiKey!,
        baseUrl: env.siliconflowBaseUrl!,
        model: env.siliconflowModel!,
        fetch: input.fetch,
      })
    : undefined;

  const analyzer = createIntentAnalyzer({
    modelClassifier,
  });

  const externalRetriever = env.ragApiUrl
    ? new ExternalRagRetriever(
        createExternalRagProvider({
          ragApiUrl: env.ragApiUrl,
          ragApiKey: env.ragApiKey,
          fetchImpl: input.fetch ?? fetch,
          timeout: env.ragApiTimeout ?? 30000, // 默认30秒超时
          retryCount: env.ragApiRetryCount ?? 2, // 默认重试2次
        }),
      )
    : undefined;

  return {
    localRetriever,
    analyzer,
    modelClassifier,
    responseGenerator,
    externalRetriever,
    taskCatalog,
    contactDirectory,
    conversationLogger,
    conversationContextService,
    // handoff 目前仍由 request-router 内部调用 `evaluateHandoff`，
    // 这里不额外包装成新 service，避免为了“组装完整”引入空抽象。
    assistant: createAssistantService({
      localRetriever,
      taskCatalog,
      contactDirectory,
      externalRetriever,
      enableExternalKnowledge: Boolean(externalRetriever),
      corpId: input.corpId,
      analyzer,
      conversationLogger,
      conversationContextService,
      responseGenerator,
    }),
  };
}

export type { AssistantRuntime };
