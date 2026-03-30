import { describe, expect, it, vi } from "vitest";

import { createAssistantService } from "./assistant.service";
import type {
  KnowledgeRetriever,
  KnowledgeSearchResult
} from "../knowledge/retriever.types";
import type { IntentAnalyzer } from "../intents/intent-analyzer";
import type { IntentAnalysis } from "../intents/intent-analyzer";
import type { TaskCatalogResolution } from "../tasks/task-catalog.types";

function createTaskCatalog() {
  const resolution: TaskCatalogResolution = {
    taskType: "leave_application",
    title: "请假申请",
    description: "用于发起请假审批，适合年假、病假、事假等场景。",
    preparations: ["确认请假日期", "准备请假类型", "提前和直属主管沟通"],
    entryUrl: "https://oa.example.com/tasks/leave-application",
    fallbackContact: "HR 同学"
  };

  return {
    resolve: vi.fn().mockReturnValue(resolution)
  };
}

function buildIntentAnalysis(
  mode: IntentAnalysis["mode"],
  overrides: Partial<IntentAnalysis> = {}
): IntentAnalysis {
  const legacyIntent =
    mode === "internal_knowledge"
      ? "knowledge_query"
      : mode === "task"
        ? "task_request"
        : mode === "open_response"
          ? "smalltalk"
          : "unknown";

  return {
    mode,
    intentConfidence: 0.9,
    needKnowledge: mode === "internal_knowledge",
    needTaskResolution: mode === "task",
    toolPlan:
      mode === "internal_knowledge"
        ? "knowledge"
        : mode === "task"
          ? "task"
          : "none",
    topicShift: false,
    intent: legacyIntent,
    source: "model",
    ...overrides
  };
}

describe("createAssistantService", () => {
  it("returns a structured reply when the retriever finds a knowledge hit", async () => {
    const localRetriever: KnowledgeRetriever = {
      async search() {
        return {
          hits: [
            {
              id: "faq-1",
              question: "补卡流程是什么",
              answer: "进入审批后发起补卡申请，由直属主管审批。",
              scope: "适用于因漏打卡产生异常的员工",
              score: 0.97,
              source: "faq"
            }
          ],
          relatedKeywords: []
        } satisfies KnowledgeSearchResult;
      }
    };

    const assistant = createAssistantService({
      localRetriever,
      taskCatalog: createTaskCatalog()
    });
    const reply = await assistant.reply("补卡流程是什么");

    expect(reply).toContain("补卡申请");
    expect(reply).toContain("适用范围");
  });

  it("returns a handoff message when no knowledge is found", async () => {
    const localRetriever: KnowledgeRetriever = {
      async search() {
        return {
          hits: [],
          relatedKeywords: []
        };
      }
    };

    const assistant = createAssistantService({
      localRetriever,
      taskCatalog: createTaskCatalog()
    });
    const reply = await assistant.reply("午饭吃什么");

    expect(reply).toContain("请联系");
  });

  it("obeys analyzer output contract for open_response without hitting retriever", async () => {
    const localRetriever: KnowledgeRetriever = {
      async search() {
        throw new Error("retriever should not be called for open_response");
      }
    };
    const analyzer: IntentAnalyzer = {
      async analyze() {
        return buildIntentAnalysis("open_response");
      }
    };

    const assistant = createAssistantService({
      localRetriever,
      analyzer,
      taskCatalog: createTaskCatalog(),
      responseGenerator: {
        generate: vi.fn().mockResolvedValue("北京七日游可以先逛中轴线，再安排一天长城。")
      }
    });
    const reply = await assistant.reply("北京七日游攻略");

    expect(reply).toContain("中轴线");
  });

  it("treats legacy handoff-style requests as clarification in contextual mode", async () => {
    const localRetriever: KnowledgeRetriever = {
      async search() {
        throw new Error("retriever should not be called for handoff");
      }
    };
    const analyzer: IntentAnalyzer = {
      async analyze() {
        return buildIntentAnalysis("clarify");
      }
    };

    const assistant = createAssistantService({
      localRetriever,
      analyzer,
      taskCatalog: createTaskCatalog()
    });
    const reply = await assistant.reply("帮我找行政");

    expect(reply).toContain("请再具体描述一下问题");
  });

  it("obeys analyzer output contract for task requests", async () => {
    const localRetriever: KnowledgeRetriever = {
      async search() {
        throw new Error("retriever should not be called for task");
      }
    };
    const analyzer: IntentAnalyzer = {
      async analyze() {
        return buildIntentAnalysis("task");
      }
    };

    const assistant = createAssistantService({
      localRetriever,
      analyzer,
      taskCatalog: createTaskCatalog()
    });
    const reply = await assistant.reply("我要请假");

    expect(reply).toContain("事务入口");
    expect(reply).toContain("https://oa.example.com/tasks/leave-application");
  });

  it("obeys analyzer output contract for unknown requests", async () => {
    const localRetriever: KnowledgeRetriever = {
      async search() {
        throw new Error("retriever should not be called for unknown");
      }
    };
    const analyzer: IntentAnalyzer = {
      async analyze() {
        return buildIntentAnalysis("clarify");
      }
    };

    const assistant = createAssistantService({
      localRetriever,
      analyzer,
      taskCatalog: createTaskCatalog()
    });
    const reply = await assistant.reply("这个呢");

    expect(reply).toContain("请再具体描述一下问题");
  });

  it("uses external provider first for knowledge_query when enabled", async () => {
    const localSearch = vi.fn().mockResolvedValue({
      hits: [
        {
          id: "local-1",
          question: "年假规则是什么",
          answer: "本地规则答案",
          scope: "适用于正式员工",
          score: 0.91,
          source: "seed"
        }
      ],
      relatedKeywords: []
    } satisfies KnowledgeSearchResult);
    const externalSearch = vi.fn().mockResolvedValue({
      hits: [
        {
          id: "rag-1",
          question: "年假规则是什么",
          answer: "外部知识库答案",
          scope: "适用于正式员工",
          score: 0.96,
          source: "rag"
        }
      ],
      relatedKeywords: []
    } satisfies KnowledgeSearchResult);
    const localRetriever: KnowledgeRetriever = {
      search: localSearch
    };
    const externalRetriever: KnowledgeRetriever = {
      search: externalSearch
    };
    const analyzer: IntentAnalyzer = {
      async analyze() {
        return buildIntentAnalysis("internal_knowledge");
      }
    };

    const assistant = createAssistantService({
      localRetriever,
      externalRetriever,
      analyzer,
      taskCatalog: createTaskCatalog(),
      enableExternalKnowledge: true
    });
    const reply = await assistant.reply("这个怎么办");

    expect(externalSearch).toHaveBeenCalledWith("这个怎么办");
    expect(localSearch).not.toHaveBeenCalled();
    expect(reply).toContain("外部知识库答案");
  });

  it("falls back to local knowledge when external provider throws", async () => {
    const localSearch = vi.fn().mockResolvedValue({
      hits: [
        {
          id: "local-2",
          question: "报销规则是什么",
          answer: "本地知识卡片答案",
          scope: "适用于报销场景",
          score: 0.9,
          source: "seed"
        }
      ],
      relatedKeywords: []
    } satisfies KnowledgeSearchResult);
    const externalSearch = vi.fn().mockRejectedValue(new Error("provider crashed"));
    const localRetriever: KnowledgeRetriever = {
      search: localSearch
    };
    const externalRetriever: KnowledgeRetriever = {
      search: externalSearch
    };
    const analyzer: IntentAnalyzer = {
      async analyze() {
        return buildIntentAnalysis("internal_knowledge");
      }
    };

    const assistant = createAssistantService({
      localRetriever,
      externalRetriever,
      analyzer,
      taskCatalog: createTaskCatalog(),
      enableExternalKnowledge: true
    });
    const reply = await assistant.reply("报销规则是什么");

    expect(externalSearch).toHaveBeenCalledWith("报销规则是什么");
    expect(localSearch).toHaveBeenCalledWith("报销规则是什么");
    expect(reply).toContain("本地知识卡片答案");
  });

  it("degrades conservatively when analyzer throws", async () => {
    const localRetriever: KnowledgeRetriever = {
      async search() {
        throw new Error("retriever should not be called after analyzer failure");
      }
    };
    const analyzer: IntentAnalyzer = {
      async analyze() {
        throw new Error("classifier crashed");
      }
    };

    const assistant = createAssistantService({
      localRetriever,
      analyzer,
      taskCatalog: createTaskCatalog()
    });
    const reply = await assistant.reply("这个怎么办");

    expect(reply).toContain("请再具体描述一下问题");
  });

  it("prefers the response generator when model output is available", async () => {
    const assistant = createAssistantService({
      localRetriever: {
        async search() {
          return {
            hits: [
              {
                id: "faq-1",
                question: "年假规则是什么",
                answer: "年假按司龄计算。",
                score: 0.98,
                source: "faq"
              }
            ],
            relatedKeywords: []
          };
        }
      },
      taskCatalog: createTaskCatalog(),
      responseGenerator: {
        generate: vi
          .fn()
          .mockResolvedValue("依据《年假规则》，年假天数按司龄计算。")
      }
    });

    const reply = await assistant.reply("年假规则是什么");

    expect(reply).toBe("依据《年假规则》，年假天数按司龄计算。");
  });

  it("falls back to reply-builder when the response generator returns null", async () => {
    const assistant = createAssistantService({
      localRetriever: {
        async search() {
          return {
            hits: [
              {
                id: "faq-1",
                question: "年假规则是什么",
                answer: "年假按司龄计算。",
                scope: "适用于正式员工",
                score: 0.98,
                source: "faq"
              }
            ],
            relatedKeywords: []
          };
        }
      },
      taskCatalog: createTaskCatalog(),
      responseGenerator: {
        generate: vi.fn().mockResolvedValue(null)
      }
    });

    const reply = await assistant.reply("年假规则是什么");

    expect(reply).toContain("结论");
    expect(reply).toContain("年假按司龄计算");
  });

  it("loads session context for the analyzer and persists both user and assistant messages", async () => {
    const append = vi.fn(async () => undefined);
    const loadRecentContext = vi.fn(async () => [
      { role: "user" as const, content: "你能做什么？" },
      { role: "assistant" as const, content: "我可以帮你查制度、找办理入口。" }
    ]);
    const analyzer: IntentAnalyzer = {
      async analyze(input) {
        expect(input).toEqual({
          query: "那请假怎么申请",
          conversationContext: [
            { role: "user", content: "你能做什么？" },
            { role: "assistant", content: "我可以帮你查制度、找办理入口。" }
          ]
        });

        return {
          ...buildIntentAnalysis("task")
        };
      }
    };

    const assistant = createAssistantService({
      localRetriever: {
        async search() {
          throw new Error("retriever should not be called for task");
        }
      },
      analyzer,
      taskCatalog: createTaskCatalog(),
      conversationContextService: {
        loadRecentContext
      },
      conversationLogger: {
        append
      }
    });

    const reply = await assistant.reply({
      query: "那请假怎么申请",
      sessionId: "session-1"
    });

    expect(reply).toContain("事务入口");
    expect(loadRecentContext).toHaveBeenCalledWith("session-1", {
      maxTurns: 6,
      ttlMs: 1800000
    });
    expect(append).toHaveBeenCalledTimes(2);
    expect(append.mock.calls[0]?.[0]).toMatchObject({
      sessionId: "session-1",
      conversationId: "session-1",
      role: "user",
      content: "那请假怎么申请",
      routeType: "task_request"
    });
    expect(append.mock.calls[1]?.[0]).toMatchObject({
      sessionId: "session-1",
      conversationId: "session-1",
      role: "assistant",
      routeType: "task_request"
    });
  });

  it("can return debug metadata for a single reply", async () => {
    const analyzer: IntentAnalyzer = {
      async analyze() {
        return buildIntentAnalysis("internal_knowledge", {
          knowledgeHint: "年假规则"
        });
      }
    };
    const assistant = createAssistantService({
      localRetriever: {
        async search() {
          return {
            hits: [
              {
                id: "doc-1",
                question: "年假规则",
                title: "年假规则",
                answer: "年假天数按司龄计算。",
                scope: "适用于正式员工",
                score: 0.98,
                source: "document",
                referenceLabel: "员工假勤管理办法 - 年假"
              }
            ],
            relatedKeywords: []
          };
        }
      },
      analyzer,
      taskCatalog: createTaskCatalog(),
      responseGenerator: {
        generate: vi.fn().mockResolvedValue("依据《员工假勤管理办法》，年假天数按司龄计算。")
      },
      conversationContextService: {
        loadRecentContext: vi.fn().mockResolvedValue([
          { role: "user", content: "你能做什么？" }
        ])
      }
    });

    const result = await assistant.replyWithDebug({
      query: "年假规则是什么",
      sessionId: "debug-session"
    });

    expect(result.reply).toContain("员工假勤管理办法");
    expect(result.intent.mode).toBe("internal_knowledge");
    expect(result.resolution.kind).toBe("knowledge");
    expect(result.conversationContext).toEqual([
      { role: "user", content: "你能做什么？" }
    ]);
    expect(result.usedResponseGenerator).toBe(true);
  });

  it("returns an open_response debug result without touching internal knowledge tools", async () => {
    const localRetriever: KnowledgeRetriever = {
      async search() {
        throw new Error("retriever should not be called for open_response");
      }
    };
    const analyzer: IntentAnalyzer = {
      async analyze() {
        return buildIntentAnalysis("open_response");
      }
    };

    const assistant = createAssistantService({
      localRetriever,
      analyzer,
      taskCatalog: createTaskCatalog(),
      responseGenerator: {
        generate: vi
          .fn()
          .mockResolvedValue("北京七日游可以按故宫、长城、颐和园、胡同、美术馆的节奏安排。")
      }
    });

    const result = await assistant.replyWithDebug({
      query: "北京七日游攻略",
      sessionId: "debug-open-response"
    });

    expect(result.intent.mode).toBe("open_response");
    expect(result.intent.toolPlan).toBe("none");
    expect(result.resolution.kind).toBe("open_response");
    expect(result.reply).toContain("故宫");
    expect(result.usedResponseGenerator).toBe(true);
  });
});
