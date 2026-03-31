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
    SILICONFLOW_API_KEY: envInput.SILICONFLOW_API_KEY,
    SILICONFLOW_BASE_URL: envInput.SILICONFLOW_BASE_URL,
    SILICONFLOW_MODEL: envInput.SILICONFLOW_MODEL,
  });

  return {
    ragApiUrl: parsed.RAG_API_URL,
    siliconflowApiKey: parsed.SILICONFLOW_API_KEY,
    siliconflowBaseUrl: parsed.SILICONFLOW_BASE_URL,
    siliconflowModel: parsed.SILICONFLOW_MODEL,
  } satisfies RuntimeEnv;
}

function mapExternalRagDocuments(payload: unknown): ExternalRagDocument[] {
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

function createExternalRagProvider(input: {
  ragApiUrl: string;
  fetchImpl: typeof fetch;
}): ExternalRagProvider {
  const baseUrl = input.ragApiUrl.replace(/\/$/, "");

  return {
    async search({ query, department }) {
      const response = await input.fetchImpl(`${baseUrl}/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          department,
        }),
      });

      if (!response.ok) {
        return [];
      }

      return mapExternalRagDocuments(await response.json());
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
          fetchImpl: input.fetch ?? fetch,
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
