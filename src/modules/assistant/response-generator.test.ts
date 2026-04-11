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

  it("logs the error reason when generation throws", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const generator = createResponseGenerator({
      apiKey: "test-key",
      baseUrl: "https://api.siliconflow.cn/v1",
      model: "Qwen/Qwen3-VL-8B-Instruct",
      fetch: vi.fn().mockRejectedValue(new Error("This operation was aborted"))
    });

    await expect(
      generator.generate({
        query: "那这个呢",
        imageUrl: "data:image/png;base64,abc123",
        resolution: {
          kind: "open_response",
          intent: "smalltalk",
          reply: "那这个呢"
        }
      })
    ).resolves.toBeNull();

    expect(warnSpy).toHaveBeenCalledWith(
      '[response] response mode=open_response query="那这个呢" failed reason="This operation was aborted"'
    );
  });

  it("sends every uploaded image to the visual model request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "这是两张凭证截图。"
            }
          }
        ]
      })
    });
    const generator = createResponseGenerator({
      apiKey: "test-key",
      baseUrl: "https://api.siliconflow.cn/v1",
      model: "Qwen/Qwen3-VL-8B-Instruct",
      fetch: fetchMock
    });

    await expect(
      generator.generate({
        query: "这两张图是什么",
        imageUrls: [
          "data:image/png;base64,abc123",
          "data:image/png;base64,def456",
        ],
        resolution: {
          kind: "open_response",
          intent: "smalltalk",
          reply: "这两张图是什么"
        }
      })
    ).resolves.toBe("这是两张凭证截图。");

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ content: Array<{ type: string; image_url?: { url: string } }> }>;
    };

    expect(requestBody.messages[1]?.content).toEqual([
      expect.objectContaining({ type: "text" }),
      {
        type: "image_url",
        image_url: { url: "data:image/png;base64,abc123" },
      },
      {
        type: "image_url",
        image_url: { url: "data:image/png;base64,def456" },
      },
    ]);
  });

  it("extracts text from multimodal content blocks returned by the provider", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: [
                {
                  type: "text",
                  text: "这是两张报销凭证截图。",
                },
              ],
            },
          },
        ],
      }),
    });
    const generator = createResponseGenerator({
      apiKey: "test-key",
      baseUrl: "https://api.siliconflow.cn/v1",
      model: "Qwen/Qwen3-VL-8B-Instruct",
      fetch: fetchMock,
    });

    await expect(
      generator.generate({
        query: "这里面是什么",
        imageUrls: [
          "data:image/png;base64,abc123",
          "data:image/png;base64,def456",
        ],
        resolution: {
          kind: "open_response",
          intent: "smalltalk",
          reply: "这里面是什么",
        },
      }),
    ).resolves.toBe("这是两张报销凭证截图。");
  });

  it("uses a longer timeout window for visual generation requests", async () => {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const setTimeoutSpy = vi.fn((handler: TimerHandler, _timeout?: number) => 123 as unknown as ReturnType<typeof setTimeout>);
    const clearTimeoutSpy = vi.fn();

    globalThis.setTimeout = setTimeoutSpy as unknown as typeof setTimeout;
    globalThis.clearTimeout = clearTimeoutSpy as typeof clearTimeout;

    try {
      const generator = createResponseGenerator({
        apiKey: "test-key",
        baseUrl: "https://api.siliconflow.cn/v1",
        model: "Qwen/Qwen3-VL-8B-Instruct",
        fetch: vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: "这是一张凭证截图。"
                }
              }
            ]
          })
        })
      });

      await expect(
        generator.generate({
          query: "这是什么图片",
          imageUrl: "data:image/png;base64,abc123",
          resolution: {
            kind: "open_response",
            intent: "smalltalk",
            reply: "这是什么图片"
          }
        })
      ).resolves.toBe("这是一张凭证截图。");

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 45000);
      expect(clearTimeoutSpy).toHaveBeenCalledWith(123);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

  it("treats open_response as a direct-answer mode instead of a company knowledge lookup", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content:
                "如果你想玩得轻松一点，可以按中轴线、故宫、颐和园、长城、胡同、美术馆、奥莱休闲这样的节奏安排七天。"
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
      query: "北京七日游攻略",
      resolution: {
        kind: "open_response",
        intent: "smalltalk",
        reply: "北京七日游攻略"
      }
    });

    expect(reply).toContain("七天");
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ content: string }>;
    };
    expect(requestBody.messages[0]?.content).toContain("也能回答一般性问题");
    expect(requestBody.messages[0]?.content).toContain("严禁编造制度、链接或联系人");
    expect(requestBody.messages[1]?.content).toContain("mode: open_response");
  });

  it("locks the assistant identity and no-hit guidance into the generation prompt", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content:
                "我暂时没检索到完全对应的制度。你是想看会议室预订，还是权限申请说明？"
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

    await generator.generate({
      query: "迟到扣钱制度",
      resolution: {
        kind: "clarification",
        intent: "unknown",
        prompt: "我暂时没找到完全对应的制度。",
        reason: "当前未找到可靠知识，请联系行政同学。",
        reasonCode: "no_candidate",
        relatedKeywords: ["会议室预订", "权限申请说明"]
      }
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ content: string }>;
    };

    expect(requestBody.messages[0]?.content).toContain(
      "如果工具没有给出事实，严禁编造制度、链接或联系人"
    );
    expect(requestBody.messages[1]?.content).toContain("reasonCode: no_candidate");
    expect(requestBody.messages[1]?.content).toContain(
      "relatedKeywords: 会议室预订、权限申请说明"
    );
  });

  it("adds an enterprise writing hint when entryMode is writing", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "这是本周项目周报初稿。"
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

    await generator.generate({
      query: "帮我写一份项目周报",
      entryMode: "writing",
      resolution: {
        kind: "open_response",
        intent: "smalltalk",
        reply: "帮我写一份项目周报"
      }
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ content: string }>;
    };

    expect(requestBody.messages[0]?.content).toContain("企业写作");
    expect(requestBody.messages[1]?.content).toContain("entryMode: writing");
  });
});
