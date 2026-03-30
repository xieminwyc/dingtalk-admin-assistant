import { describe, expect, it, vi } from "vitest";

import { createRequestRouter } from "./request-router";
import type { IntentAnalysis } from "../intents/intent-analyzer";
import type {
  KnowledgeRetriever,
  KnowledgeSearchResult
} from "../knowledge/retriever.types";
import type { ContactDirectoryResolution } from "../contacts/contact-directory.types";
import type { TaskCatalogResolution } from "../tasks/task-catalog.types";

function createTaskCatalogStub(
  resolution: TaskCatalogResolution = {
    taskType: "leave_application",
    title: "请假申请",
    description: "用于发起请假审批，适合年假、病假、事假等场景。",
    preparations: ["确认请假日期", "准备请假类型", "提前和直属主管沟通"],
    entryUrl: "https://oa.example.com/tasks/leave-application",
    availability: "available",
    fallbackContact: "HR 同学"
  }
) {
  return {
    resolve: vi.fn().mockReturnValue(resolution)
  };
}

function buildLocalKnowledgeRetriever(): KnowledgeRetriever {
  return {
    search: vi.fn().mockResolvedValue({
      hits: [
        {
          id: "card-1",
          title: "年假规则",
          question: "年假规则是什么",
          answer: "年假按司龄计算。",
          scope: "适用于正式员工",
          score: 0.92,
          source: "seed",
          referenceLabel: "年假规则"
        }
      ],
      relatedKeywords: []
    } satisfies KnowledgeSearchResult)
  };
}

function emptyKnowledgeResult(): KnowledgeSearchResult {
  return {
    hits: [],
    relatedKeywords: []
  };
}

function buildIntent(intent: IntentAnalysis["intent"]): IntentAnalysis {
  return {
    mode:
      intent === "knowledge_query"
        ? "internal_knowledge"
        : intent === "task_request"
          ? "task"
          : intent === "smalltalk"
            ? "open_response"
            : "clarify",
    intentConfidence: 0.9,
    needKnowledge: intent === "knowledge_query",
    needTaskResolution: intent === "task_request",
    toolPlan:
      intent === "knowledge_query"
        ? "knowledge"
        : intent === "task_request"
          ? "task"
          : "none",
    topicShift: false,
    intent,
    source: "model"
  };
}

function createContactDirectoryStub(
  resolution: ContactDirectoryResolution | null = {
    title: "PMS 制卡问题",
    contactName: "门店系统支持同学",
    team: "门店系统支持",
    description: "负责 PMS 制卡和门卡问题。",
    actionHint: "联系前准备门店名称和报错信息。"
  }
) {
  return {
    resolve: vi.fn().mockReturnValue(resolution)
  };
}

describe("createRequestRouter", () => {
  it("routes knowledge_query to knowledge resolution", async () => {
    const localRetriever = buildLocalKnowledgeRetriever();
    const externalRetriever: KnowledgeRetriever = {
      search: vi.fn().mockResolvedValue(emptyKnowledgeResult())
    };
    const taskCatalog = createTaskCatalogStub();
    const router = createRequestRouter({
      localRetriever,
      externalRetriever,
      taskCatalog,
      enableExternalKnowledge: false
    });

    const resolution = await router.route({
      query: "年假规则是什么",
      intent: buildIntent("knowledge_query")
    });

    expect(resolution.kind).toBe("knowledge");
    expect(resolution.intent).toBe("knowledge_query");
    if (resolution.kind === "knowledge") {
      expect(resolution.answer).toContain("司龄");
      expect(resolution.referenceLabel).toBe("年假规则");
    }
    expect(localRetriever.search).toHaveBeenCalledWith("年假规则是什么");
    expect(externalRetriever.search).not.toHaveBeenCalled();
  });

  it("routes task_request to task resolution", async () => {
    const localRetriever: KnowledgeRetriever = {
      search: vi.fn().mockResolvedValue(emptyKnowledgeResult())
    };
    const taskCatalog = createTaskCatalogStub();
    const router = createRequestRouter({
      localRetriever,
      taskCatalog
    });

    const resolution = await router.route({
      query: "我要请假",
      intent: buildIntent("task_request")
    });

    expect(resolution).toMatchObject({
      kind: "task",
      intent: "task_request"
    });
    if (resolution.kind === "task") {
      expect(resolution.entry).toContain("https://oa.example.com/tasks/leave-application");
      expect(resolution.availability).toBe("available");
    }
    expect(taskCatalog.resolve).toHaveBeenCalledWith({ query: "我要请假" });
    expect(localRetriever.search).not.toHaveBeenCalled();
  });

  it("passes structured taskType to task resolver when provided", async () => {
    const localRetriever: KnowledgeRetriever = {
      search: vi.fn().mockResolvedValue(emptyKnowledgeResult())
    };
    const taskCatalog = createTaskCatalogStub({
      taskType: "expense_application",
      title: "报销申请",
      description: "用于提交差旅、办公和招待等费用报销。",
      preparations: ["整理发票凭证"],
      entryUrl: "https://oa.example.com/tasks/expense-application",
      fallbackContact: "财务同学"
    });
    const router = createRequestRouter({
      localRetriever,
      taskCatalog
    });

    const resolution = await router.route({
      query: "帮我发起申请",
      taskType: "expense_application",
      intent: buildIntent("task_request")
    });

    expect(taskCatalog.resolve).toHaveBeenCalledWith({
      query: "帮我发起申请",
      taskType: "expense_application"
    });
    expect(resolution.kind).toBe("task");
    if (resolution.kind === "task") {
      expect(resolution.entry).toContain("expense-application");
    }
  });

  it("no longer treats handoff as a top-level route in contextual mode", async () => {
    const localRetriever: KnowledgeRetriever = {
      search: vi.fn().mockResolvedValue(emptyKnowledgeResult())
    };
    const router = createRequestRouter({
      localRetriever,
      taskCatalog: createTaskCatalogStub()
    });

    const resolution = await router.route({
      query: "帮我转人工",
      intent: buildIntent("handoff_request")
    });

    expect(resolution).toEqual({
      kind: "clarification",
      intent: "unknown",
      prompt: "我可以帮你查制度说明，或告诉你办理入口。请再具体描述一下问题。"
    });
    expect(localRetriever.search).not.toHaveBeenCalled();
  });

  it("routes open_response to a direct-answer resolution without hitting tools", async () => {
    const localRetriever: KnowledgeRetriever = {
      search: vi.fn().mockResolvedValue(emptyKnowledgeResult())
    };
    const router = createRequestRouter({
      localRetriever,
      taskCatalog: createTaskCatalogStub()
    });

    const resolution = await router.route({
      query: "北京七日游攻略",
      intent: buildIntent("smalltalk")
    });

    expect(resolution).toEqual({
      kind: "open_response",
      intent: "smalltalk",
      reply: "北京七日游攻略"
    });
    expect(localRetriever.search).not.toHaveBeenCalled();
  });

  it("routes unknown to clarification", async () => {
    const localRetriever: KnowledgeRetriever = {
      search: vi.fn().mockResolvedValue(emptyKnowledgeResult())
    };
    const router = createRequestRouter({
      localRetriever,
      taskCatalog: createTaskCatalogStub()
    });

    const resolution = await router.route({
      query: "这个呢",
      intent: buildIntent("unknown")
    });

    expect(resolution).toEqual({
      kind: "clarification",
      intent: "unknown",
      prompt: "我可以帮你查制度说明，或告诉你办理入口。请再具体描述一下问题。"
    });
    expect(localRetriever.search).not.toHaveBeenCalled();
  });

  it("uses decision mode instead of the bridged legacy intent when routing", async () => {
    const localRetriever = buildLocalKnowledgeRetriever();
    const router = createRequestRouter({
      localRetriever,
      taskCatalog: createTaskCatalogStub()
    });

    const resolution = await router.route({
      query: "年假规则是什么",
      intent: {
        ...buildIntent("unknown"),
        mode: "internal_knowledge",
        needKnowledge: true
      }
    });

    expect(resolution.kind).toBe("knowledge");
    expect(localRetriever.search).toHaveBeenCalledWith("年假规则是什么");
  });

  it("uses the model-provided clarify question and related keywords", async () => {
    const localRetriever: KnowledgeRetriever = {
      search: vi.fn().mockResolvedValue(emptyKnowledgeResult())
    };
    const router = createRequestRouter({
      localRetriever,
      taskCatalog: createTaskCatalogStub()
    });

    const resolution = await router.route({
      query: "这个怎么办",
      intent: {
        ...buildIntent("unknown"),
        mode: "clarify",
        clarifyQuestion: "你是想查制度说明，还是想办理流程？"
      }
    });

    expect(resolution).toEqual({
      kind: "clarification",
      intent: "unknown",
      prompt: "你是想查制度说明，还是想办理流程？"
    });
  });

  it("does not hit the company knowledge retriever for open_response questions", async () => {
    const localRetriever: KnowledgeRetriever = {
      search: vi.fn().mockResolvedValue(emptyKnowledgeResult())
    };
    const router = createRequestRouter({
      localRetriever,
      taskCatalog: createTaskCatalogStub()
    });

    const resolution = await router.route({
      query: "深圳天气怎么样",
      intent: {
        ...buildIntent("smalltalk"),
        mode: "open_response",
        needKnowledge: false,
        needTaskResolution: false,
        toolPlan: "none"
      }
    });

    expect(resolution.kind).toBe("open_response");
    expect(localRetriever.search).not.toHaveBeenCalled();
  });

  it("returns a no-candidate clarification with related keywords when knowledge misses", async () => {
    const localRetriever: KnowledgeRetriever = {
      search: vi.fn().mockResolvedValue({
        hits: [],
        relatedKeywords: ["会议室预订", "权限申请说明"]
      } satisfies KnowledgeSearchResult)
    };
    const router = createRequestRouter({
      localRetriever,
      taskCatalog: createTaskCatalogStub()
    });

    const resolution = await router.route({
      query: "迟到扣钱制度",
      intent: buildIntent("knowledge_query")
    });

    expect(resolution).toEqual({
      kind: "clarification",
      intent: "unknown",
      prompt: "我可以帮你查制度说明，或告诉你办理入口。请再具体描述一下问题。",
      reason: "当前未找到可靠知识，请联系行政同学。",
      reasonCode: "no_candidate",
      relatedKeywords: ["会议室预订", "权限申请说明"]
    });
  });

  it("returns a low-confidence clarification when top knowledge hit is not reliable enough", async () => {
    const localRetriever: KnowledgeRetriever = {
      search: vi.fn().mockResolvedValue({
        hits: [
          {
            id: "card-low-score",
            title: "会议制度",
            question: "会议制度",
            answer: "一条不够可靠的制度说明。",
            score: 0.45,
            source: "seed"
          }
        ],
        relatedKeywords: ["会议室预订"]
      } satisfies KnowledgeSearchResult)
    };
    const router = createRequestRouter({
      localRetriever,
      taskCatalog: createTaskCatalogStub()
    });

    const resolution = await router.route({
      query: "会议制度",
      intent: buildIntent("knowledge_query")
    });

    expect(resolution).toEqual({
      kind: "clarification",
      intent: "unknown",
      prompt: "我可以帮你查制度说明，或告诉你办理入口。请再具体描述一下问题。",
      reason: "当前未找到可靠知识，请联系行政同学。",
      reasonCode: "low_confidence",
      relatedKeywords: ["会议室预订"]
    });
  });

  it("falls back to local knowledge when external provider throws", async () => {
    const localRetriever = buildLocalKnowledgeRetriever();
    const externalRetriever: KnowledgeRetriever = {
      search: vi.fn().mockRejectedValue(new Error("provider unavailable"))
    };
    const taskCatalog = createTaskCatalogStub();
    const router = createRequestRouter({
      localRetriever,
      externalRetriever,
      taskCatalog,
      enableExternalKnowledge: true
    });

    const resolution = await router.route({
      query: "年假规则是什么",
      intent: buildIntent("knowledge_query")
    });

    expect(externalRetriever.search).toHaveBeenCalledWith("年假规则是什么");
    expect(localRetriever.search).toHaveBeenCalledWith("年假规则是什么");
    expect(resolution.kind).toBe("knowledge");
    if (resolution.kind === "knowledge") {
      expect(resolution.answer).toContain("司龄");
    }
  });

  it("falls back to local knowledge when external provider returns a low-score hit", async () => {
    const localRetriever = buildLocalKnowledgeRetriever();
    const externalRetriever: KnowledgeRetriever = {
      search: vi.fn().mockResolvedValue({
        hits: [
          {
            id: "rag-low-score",
            title: "年假规则",
            question: "年假规则是什么",
            answer: "这是一条不可靠的外部答案",
            scope: "适用于正式员工",
            score: 0.32,
            source: "rag"
          }
        ],
        relatedKeywords: []
      } satisfies KnowledgeSearchResult)
    };
    const taskCatalog = createTaskCatalogStub();
    const router = createRequestRouter({
      localRetriever,
      externalRetriever,
      taskCatalog,
      enableExternalKnowledge: true
    });

    const resolution = await router.route({
      query: "年假规则是什么",
      intent: buildIntent("knowledge_query")
    });

    expect(externalRetriever.search).toHaveBeenCalledWith("年假规则是什么");
    expect(localRetriever.search).toHaveBeenCalledWith("年假规则是什么");
    expect(resolution.kind).toBe("knowledge");
    if (resolution.kind === "knowledge") {
      expect(resolution.answer).toContain("司龄");
    }
  });

  it("falls back to local knowledge when external provider returns no hits", async () => {
    const localRetriever = buildLocalKnowledgeRetriever();
    const externalRetriever: KnowledgeRetriever = {
      search: vi.fn().mockResolvedValue(emptyKnowledgeResult())
    };
    const taskCatalog = createTaskCatalogStub();
    const router = createRequestRouter({
      localRetriever,
      externalRetriever,
      taskCatalog,
      enableExternalKnowledge: true
    });

    const resolution = await router.route({
      query: "年假规则是什么",
      intent: buildIntent("knowledge_query")
    });

    expect(externalRetriever.search).toHaveBeenCalledWith("年假规则是什么");
    expect(localRetriever.search).toHaveBeenCalledWith("年假规则是什么");
    expect(resolution.kind).toBe("knowledge");
    if (resolution.kind === "knowledge") {
      expect(resolution.answer).toContain("司龄");
    }
  });

  it("routes contact entryMode to a contact resolution before falling back to intent mode", async () => {
    const localRetriever: KnowledgeRetriever = {
      search: vi.fn().mockResolvedValue(emptyKnowledgeResult())
    };
    const contactDirectory = createContactDirectoryStub();
    const router = createRequestRouter({
      localRetriever,
      taskCatalog: createTaskCatalogStub(),
      contactDirectory
    });

    const resolution = await router.route({
      query: "PMS制卡问题应该找谁处理？",
      entryMode: "contact",
      intent: buildIntent("unknown")
    });

    expect(contactDirectory.resolve).toHaveBeenCalledWith({
      query: "PMS制卡问题应该找谁处理？"
    });
    expect(resolution).toMatchObject({
      kind: "contact",
      intent: "handoff_request"
    });
  });

  it("returns an image placeholder reply for image entryMode", async () => {
    const localRetriever: KnowledgeRetriever = {
      search: vi.fn().mockResolvedValue(emptyKnowledgeResult())
    };
    const router = createRequestRouter({
      localRetriever,
      taskCatalog: createTaskCatalogStub(),
      contactDirectory: createContactDirectoryStub()
    });

    const resolution = await router.route({
      query: "画一幅江南春景图",
      entryMode: "image_placeholder",
      intent: buildIntent("smalltalk")
    });

    expect(resolution).toEqual({
      kind: "open_response",
      intent: "smalltalk",
      reply:
        "图片生成功能即将支持。你可以先告诉我主题、风格和使用场景，我可以先帮你整理提示词。"
    });
  });

  it("keeps writing entryMode on the direct-answer path", async () => {
    const localRetriever: KnowledgeRetriever = {
      search: vi.fn().mockResolvedValue(emptyKnowledgeResult())
    };
    const router = createRequestRouter({
      localRetriever,
      taskCatalog: createTaskCatalogStub(),
      contactDirectory: createContactDirectoryStub()
    });

    const resolution = await router.route({
      query: "帮我写一份项目周报",
      entryMode: "writing",
      intent: buildIntent("smalltalk")
    });

    expect(resolution).toEqual({
      kind: "open_response",
      intent: "smalltalk",
      reply: "帮我写一份项目周报"
    });
  });
});
