import { afterEach, describe, expect, it, vi } from "vitest";

import { createResponseGenerator } from "./response-generator";

describe("createResponseGenerator", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generates a grounded knowledge reply with citation context", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "依据《年假规则》，年假天数按司龄计算。"
            }
          }
        ]
      })
    });
    const generator = createResponseGenerator({
      apiKey: "test-key",
      baseUrl: "https://api.siliconflow.cn/v1",
      model: "Qwen/Qwen3-8B",
      fetch: fetchMock
    });

    const reply = await generator.generate({
      query: "年假规则是什么",
      conversationContext: [
        { role: "user", content: "你能做什么？" },
        { role: "assistant", content: "我可以帮你查制度、找办理入口。" }
      ],
      resolution: {
        kind: "knowledge",
        intent: "knowledge_query",
        title: "年假规则",
        answer: "年假天数按司龄计算。",
        scope: "适用于正式员工",
        referenceLabel: "年假规则"
      }
    });

    expect(reply).toBe("依据《年假规则》，年假天数按司龄计算。");
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ content: string }>;
    };
    expect(requestBody.messages[1]?.content).toContain("referenceLabel: 年假规则");
    expect(requestBody.messages[1]?.content).toContain("answer: 年假天数按司龄计算。");
  });

  it("generates a task reply with real entry information", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "你可以通过 https://oa.example.com/tasks/leave-application 发起请假申请。"
            }
          }
        ]
      })
    });
    const generator = createResponseGenerator({
      apiKey: "test-key",
      baseUrl: "https://api.siliconflow.cn/v1",
      model: "Qwen/Qwen3-8B",
      fetch: fetchMock
    });

    const reply = await generator.generate({
      query: "我要请假",
      resolution: {
        kind: "task",
        intent: "task_request",
        title: "请假申请",
        entry: "https://oa.example.com/tasks/leave-application",
        guidance: "先确认请假日期再提交审批。",
        actionType: "url",
        availability: "available"
      }
    });

    expect(reply).toContain("leave-application");
  });

  it("returns null when generation fails so callers can fall back", async () => {
    const generator = createResponseGenerator({
      apiKey: "test-key",
      baseUrl: "https://api.siliconflow.cn/v1",
      model: "Qwen/Qwen3-8B",
      fetch: vi.fn().mockRejectedValue(new Error("network down"))
    });

    await expect(
      generator.generate({
        query: "这个怎么办",
        resolution: {
          kind: "clarification",
          intent: "unknown",
          prompt: "你是想查制度说明，还是想办理流程？"
        }
      })
    ).resolves.toBeNull();
  });
});
