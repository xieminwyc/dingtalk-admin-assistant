import { describe, expect, it, vi } from "vitest";

import { createAssistantService } from "./assistant.service";
import type {
  KnowledgeRetriever,
  KnowledgeSearchResult
} from "../knowledge/retriever.types";
import type { IntentAnalyzer } from "../intents/intent-analyzer";
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

  it("obeys analyzer output contract for smalltalk without hitting retriever", async () => {
    const localRetriever: KnowledgeRetriever = {
      async search() {
        throw new Error("retriever should not be called for smalltalk");
      }
    };
    const analyzer: IntentAnalyzer = {
      async analyze() {
        return {
          intent: "smalltalk",
          source: "rule"
        };
      }
    };

    const assistant = createAssistantService({
      localRetriever,
      analyzer,
      taskCatalog: createTaskCatalog()
    });
    const reply = await assistant.reply("你好");

    expect(reply).toContain("你好");
  });

  it("obeys analyzer output contract for handoff requests", async () => {
    const localRetriever: KnowledgeRetriever = {
      async search() {
        throw new Error("retriever should not be called for handoff");
      }
    };
    const analyzer: IntentAnalyzer = {
      async analyze() {
        return {
          intent: "handoff_request",
          source: "rule"
        };
      }
    };

    const assistant = createAssistantService({
      localRetriever,
      analyzer,
      taskCatalog: createTaskCatalog()
    });
    const reply = await assistant.reply("帮我找行政");

    expect(reply).toContain("联系行政同学");
  });

  it("obeys analyzer output contract for task requests", async () => {
    const localRetriever: KnowledgeRetriever = {
      async search() {
        throw new Error("retriever should not be called for task");
      }
    };
    const analyzer: IntentAnalyzer = {
      async analyze() {
        return {
          intent: "task_request",
          source: "rule"
        };
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
        return {
          intent: "unknown",
          source: "none"
        };
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
        return {
          intent: "knowledge_query",
          source: "model"
        };
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
        return {
          intent: "knowledge_query",
          source: "model"
        };
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
});
