import { describe, expect, it } from "vitest";

import { createAssistantService } from "./assistant.service";
import type { KnowledgeRetriever } from "../knowledge/retriever.types";

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
});
