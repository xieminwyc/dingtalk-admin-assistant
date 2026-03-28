import { describe, expect, it, vi } from "vitest";

import { createRequestRouter } from "./request-router";
import type { IntentAnalysis } from "../intents/intent-analyzer";
import type { KnowledgeRetriever } from "../knowledge/retriever.types";
import type { TaskCatalogResolution } from "../tasks/task-catalog.types";

function createTaskCatalogStub(
  resolution: TaskCatalogResolution = {
    taskType: "leave_application",
    title: "请假申请",
    description: "用于发起请假审批，适合年假、病假、事假等场景。",
    preparations: ["确认请假日期", "准备请假类型", "提前和直属主管沟通"],
    entryUrl: "https://oa.example.com/tasks/leave-application",
    fallbackContact: "HR 同学"
  }
) {
  return {
    resolve: vi.fn().mockReturnValue(resolution)
  };
}

function buildLocalKnowledgeRetriever(): KnowledgeRetriever {
  return {
    search: vi.fn().mockResolvedValue([
      {
        id: "card-1",
        title: "年假规则",
        question: "年假规则是什么",
        answer: "年假按司龄计算。",
        scope: "适用于正式员工",
        score: 0.92,
        source: "knowledge_card"
      }
    ])
  };
}

function buildIntent(intent: IntentAnalysis["intent"]): IntentAnalysis {
  return {
    intent,
    source: "rule"
  };
}

describe("createRequestRouter", () => {
  it("routes knowledge_query to knowledge resolution", async () => {
    const localRetriever = buildLocalKnowledgeRetriever();
    const externalRetriever: KnowledgeRetriever = {
      search: vi.fn().mockResolvedValue([])
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
    }
    expect(localRetriever.search).toHaveBeenCalledWith("年假规则是什么");
    expect(externalRetriever.search).not.toHaveBeenCalled();
  });

  it("routes task_request to task resolution", async () => {
    const localRetriever: KnowledgeRetriever = {
      search: vi.fn().mockResolvedValue([])
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
    }
    expect(taskCatalog.resolve).toHaveBeenCalledWith({ query: "我要请假" });
    expect(localRetriever.search).not.toHaveBeenCalled();
  });

  it("passes structured taskType to task resolver when provided", async () => {
    const localRetriever: KnowledgeRetriever = {
      search: vi.fn().mockResolvedValue([])
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

  it("routes handoff_request to handoff resolution", async () => {
    const localRetriever: KnowledgeRetriever = {
      search: vi.fn().mockResolvedValue([])
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
      kind: "handoff",
      intent: "handoff_request",
      reason: "这类需求更适合行政同学直接处理，请联系行政同学。"
    });
    expect(localRetriever.search).not.toHaveBeenCalled();
  });

  it("routes smalltalk to a lightweight reply", async () => {
    const localRetriever: KnowledgeRetriever = {
      search: vi.fn().mockResolvedValue([])
    };
    const router = createRequestRouter({
      localRetriever,
      taskCatalog: createTaskCatalogStub()
    });

    const resolution = await router.route({
      query: "你好",
      intent: buildIntent("smalltalk")
    });

    expect(resolution).toEqual({
      kind: "smalltalk",
      intent: "smalltalk",
      reply: "你好，我可以帮你查行政制度或办理入口。"
    });
    expect(localRetriever.search).not.toHaveBeenCalled();
  });

  it("routes unknown to clarification", async () => {
    const localRetriever: KnowledgeRetriever = {
      search: vi.fn().mockResolvedValue([])
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
      search: vi.fn().mockResolvedValue([
        {
          id: "rag-low-score",
          title: "年假规则",
          question: "年假规则是什么",
          answer: "这是一条不可靠的外部答案",
          scope: "适用于正式员工",
          score: 0.32,
          source: "rag"
        }
      ])
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
      search: vi.fn().mockResolvedValue([])
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
});
