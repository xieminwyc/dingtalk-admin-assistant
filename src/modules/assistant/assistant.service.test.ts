import { describe, expect, it, vi } from "vitest";

import { createAssistantService } from "./assistant.service";
import type { KnowledgeRetriever } from "../knowledge/retriever.types";
import type { IntentAnalyzer } from "../intents/intent-analyzer";

describe("createAssistantService", () => {
  it("returns a structured reply when the retriever finds a knowledge hit", async () => {
    const retriever: KnowledgeRetriever = {
      async search() {
        return [
          {
            id: "faq-1",
            question: "补卡流程是什么",
            answer: "进入审批后发起补卡申请，由直属主管审批。",
            scope: "适用于因漏打卡产生异常的员工",
            score: 0.97,
            source: "faq"
          }
        ];
      }
    };

    const assistant = createAssistantService({ retriever });
    const reply = await assistant.reply("补卡流程是什么");

    expect(reply).toContain("补卡申请");
    expect(reply).toContain("适用范围");
  });

  it("returns a handoff message when no knowledge is found", async () => {
    const retriever: KnowledgeRetriever = {
      async search() {
        return [];
      }
    };

    const assistant = createAssistantService({ retriever });
    const reply = await assistant.reply("午饭吃什么");

    expect(reply).toContain("请联系");
  });

  it("obeys analyzer output contract for smalltalk without hitting retriever", async () => {
    const retriever: KnowledgeRetriever = {
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

    const assistant = createAssistantService({ retriever, analyzer });
    const reply = await assistant.reply("你好");

    expect(reply).toContain("你好");
  });

  it("obeys analyzer output contract for handoff requests", async () => {
    const retriever: KnowledgeRetriever = {
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

    const assistant = createAssistantService({ retriever, analyzer });
    const reply = await assistant.reply("帮我找行政");

    expect(reply).toContain("联系行政同学");
  });

  it("obeys analyzer output contract for task requests", async () => {
    const retriever: KnowledgeRetriever = {
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

    const assistant = createAssistantService({ retriever, analyzer });
    const reply = await assistant.reply("我要请假");

    expect(reply).toContain("事务入口");
    expect(reply).toContain("联系行政同学");
  });

  it("obeys analyzer output contract for unknown requests", async () => {
    const retriever: KnowledgeRetriever = {
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

    const assistant = createAssistantService({ retriever, analyzer });
    const reply = await assistant.reply("这个呢");

    expect(reply).toContain("请再具体描述一下问题");
  });

  it("uses retriever when model fallback returns knowledge_query", async () => {
    const search = vi.fn().mockResolvedValue([
      {
        id: "faq-2",
        question: "年假规则是什么",
        answer: "年假按司龄计算。",
        scope: "适用于正式员工",
        score: 0.91,
        source: "faq"
      }
    ]);
    const retriever: KnowledgeRetriever = {
      search
    };
    const analyzer: IntentAnalyzer = {
      async analyze() {
        return {
          intent: "knowledge_query",
          source: "model"
        };
      }
    };

    const assistant = createAssistantService({ retriever, analyzer });
    const reply = await assistant.reply("这个怎么办");

    expect(search).toHaveBeenCalledWith("这个怎么办");
    expect(reply).toContain("年假按司龄计算");
  });

  it("degrades conservatively when analyzer throws", async () => {
    const retriever: KnowledgeRetriever = {
      async search() {
        throw new Error("retriever should not be called after analyzer failure");
      }
    };
    const analyzer: IntentAnalyzer = {
      async analyze() {
        throw new Error("classifier crashed");
      }
    };

    const assistant = createAssistantService({ retriever, analyzer });
    const reply = await assistant.reply("这个怎么办");

    expect(reply).toContain("请再具体描述一下问题");
  });
});
