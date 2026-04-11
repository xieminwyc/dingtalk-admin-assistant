import { afterEach, describe, expect, it, vi } from "vitest";

import { createModelIntentClassifier } from "./model-intent-classifier";

describe("createModelIntentClassifier", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses SiliconFlow chat completions response into an assistant decision", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                mode: "task",
                intentConfidence: 0.93,
                needKnowledge: false,
                needTaskResolution: true,
                toolPlan: "task",
                topicShift: false,
                taskHint: "leave_application"
              })
            }
          }
        ]
      })
    });

    const classifier = createModelIntentClassifier({
      apiKey: "test-key",
      baseUrl: "https://api.siliconflow.cn/v1",
      model: "Qwen/Qwen3-8B",
      fetch: fetchMock
    });

    const result = await classifier.classify({
      query: "我要请假",
      conversationContext: [
        { role: "user", content: "你能做什么？" },
        { role: "assistant", content: "我可以帮你查制度、找办理入口。" }
      ]
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.siliconflow.cn/v1/chat/completions"
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      model: "Qwen/Qwen3-8B",
      temperature: 0
    });
    expect(result).toEqual({
      mode: "task",
      intentConfidence: 0.93,
      needKnowledge: false,
      needTaskResolution: true,
      toolPlan: "task",
      topicShift: false,
      taskHint: "leave_application"
    });
    expect(infoSpy).toHaveBeenNthCalledWith(
      1,
      '[siliconflow] request model="Qwen/Qwen3-8B" query="我要请假" hasImage=false'
    );
    expect(infoSpy).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('[siliconflow] response mode=task query="我要请假"')
    );
  });

  it("includes recent conversation context in the model prompt", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                mode: "open_response",
                intentConfidence: 0.88,
                needKnowledge: false,
                needTaskResolution: false,
                toolPlan: "none",
                topicShift: false
              })
            }
          }
        ]
      })
    });

    const classifier = createModelIntentClassifier({
      apiKey: "test-key",
      baseUrl: "https://api.siliconflow.cn/v1",
      model: "Qwen/Qwen3-8B",
      fetch: fetchMock
    });

    await classifier.classify({
      query: "那请假怎么申请",
      conversationContext: [
        { role: "user", content: "你能做什么？" },
        { role: "assistant", content: "我可以帮你查制度、找办理入口。" }
      ]
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ role: string; content: string }>;
    };

    expect(requestBody.messages[1]?.content).toContain("最近对话上下文");
    expect(requestBody.messages[1]?.content).toContain("user: 你能做什么？");
    expect(requestBody.messages[1]?.content).toContain(
      "assistant: 我可以帮你查制度、找办理入口。"
    );
  });

  it("does not force json response_format for multimodal requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                mode: "open_response",
                intentConfidence: 0.9,
                needKnowledge: false,
                needTaskResolution: false,
                toolPlan: "none",
                topicShift: false,
                reply: "这是一张报销流程截图。"
              })
            }
          }
        ]
      })
    });

    const classifier = createModelIntentClassifier({
      apiKey: "test-key",
      baseUrl: "https://api.siliconflow.cn/v1",
      model: "Qwen/Qwen3-VL-8B-Instruct",
      fetch: fetchMock
    });

    await classifier.classify({
      query: "请识别这张图片内容",
      imageUrl: "data:image/png;base64,abc123"
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      response_format?: { type: string };
      messages: Array<{
        role: string;
        content:
          | string
          | Array<
              | { type: "text"; text: string }
              | { type: "image_url"; image_url: { url: string } }
            >;
      }>;
    };

    expect(requestBody.response_format).toBeUndefined();
    expect(requestBody.messages[1]?.content).toEqual([
      {
        type: "text",
        text: expect.stringContaining("当前用户消息：请识别这张图片内容")
      },
      {
        type: "image_url",
        image_url: {
          url: "data:image/png;base64,abc123"
        }
      }
    ]);
  });

  it("teaches the model to treat short policy phrases as internal knowledge queries", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                mode: "internal_knowledge",
                intentConfidence: 0.91,
                needKnowledge: true,
                needTaskResolution: false,
                toolPlan: "knowledge",
                topicShift: false,
                knowledgeHint: "迟到扣款制度"
              })
            }
          }
        ]
      })
    });

    const classifier = createModelIntentClassifier({
      apiKey: "test-key",
      baseUrl: "https://api.siliconflow.cn/v1",
      model: "Qwen/Qwen3-8B",
      fetch: fetchMock
    });

    await classifier.classify({
      query: "迟到扣款制度说明"
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ role: string; content: string }>;
    };

    expect(requestBody.messages[0]?.content).toContain("短的制度名词短语");
    expect(requestBody.messages[0]?.content).toContain("迟到扣款");
    expect(requestBody.messages[0]?.content).toContain("病假工资");
    expect(requestBody.messages[0]?.content).toContain("年假天数");
    expect(requestBody.messages[0]?.content).toContain(
      "这类表达优先判断为 internal_knowledge"
    );
    expect(requestBody.messages[0]?.content).toContain("迟到打卡怎么算");
    expect(requestBody.messages[0]?.content).toContain(
      "不要因为自己不知道答案、知识库可能暂时没有命中"
    );
    expect(requestBody.messages[0]?.content).toContain(
      "意图判断只看用户当前想做什么"
    );
    expect(requestBody.messages[0]?.content).toContain("报销流程是什么");
    expect(requestBody.messages[0]?.content).toContain("报销流程说明");
    expect(requestBody.messages[0]?.content).toContain("OA 费用报销申请怎么填");
    expect(requestBody.messages[0]?.content).toContain("那上班时间呢");
  });

  it("preserves reply for open_response decisions", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                mode: "open_response",
                intentConfidence: 0.98,
                needKnowledge: false,
                needTaskResolution: false,
                toolPlan: "none",
                topicShift: false,
                reply: "你好，我是你的员工助手。"
              })
            }
          }
        ]
      })
    });

    const classifier = createModelIntentClassifier({
      apiKey: "test-key",
      baseUrl: "https://api.siliconflow.cn/v1",
      model: "Qwen/Qwen3-8B",
      fetch: fetchMock
    });

    await expect(classifier.classify({ query: "你好" })).resolves.toEqual({
      mode: "open_response",
      intentConfidence: 0.98,
      needKnowledge: false,
      needTaskResolution: false,
      toolPlan: "none",
      topicShift: false,
      reply: "你好，我是你的员工助手。"
    });
  });

  it("preserves reply for general open_response questions", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                mode: "open_response",
                intentConfidence: 0.94,
                needKnowledge: false,
                needTaskResolution: false,
                toolPlan: "none",
                topicShift: false,
                reply: "如果你想轻松一点，我建议按故宫、中轴线、长城、颐和园、胡同这样安排。"
              })
            }
          }
        ]
      })
    });

    const classifier = createModelIntentClassifier({
      apiKey: "test-key",
      baseUrl: "https://api.siliconflow.cn/v1",
      model: "Qwen/Qwen3-8B",
      fetch: fetchMock
    });

    await expect(classifier.classify({ query: "北京七日游攻略" })).resolves.toEqual({
      mode: "open_response",
      intentConfidence: 0.94,
      needKnowledge: false,
      needTaskResolution: false,
      toolPlan: "none",
      topicShift: false,
      reply: "如果你想轻松一点，我建议按故宫、中轴线、长城、颐和园、胡同这样安排。"
    });
  });

  it("drops reply for non-open_response decisions", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                mode: "task",
                intentConfidence: 0.95,
                needKnowledge: false,
                needTaskResolution: true,
                toolPlan: "task",
                topicShift: false,
                taskHint: "leave_application",
                reply: "这个字段不应该被保留"
              })
            }
          }
        ]
      })
    });

    const classifier = createModelIntentClassifier({
      apiKey: "test-key",
      baseUrl: "https://api.siliconflow.cn/v1",
      model: "Qwen/Qwen3-8B",
      fetch: fetchMock
    });

    await expect(classifier.classify({ query: "我要请假" })).resolves.toEqual({
      mode: "task",
      intentConfidence: 0.95,
      needKnowledge: false,
      needTaskResolution: true,
      toolPlan: "task",
      topicShift: false,
      taskHint: "leave_application"
    });
  });

  it("treats blank reply as missing", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                mode: "open_response",
                intentConfidence: 0.96,
                needKnowledge: false,
                needTaskResolution: false,
                toolPlan: "none",
                topicShift: false,
                reply: "   "
              })
            }
          }
        ]
      })
    });

    const classifier = createModelIntentClassifier({
      apiKey: "test-key",
      baseUrl: "https://api.siliconflow.cn/v1",
      model: "Qwen/Qwen3-8B",
      fetch: fetchMock
    });

    await expect(classifier.classify({ query: "你好" })).resolves.toEqual({
      mode: "open_response",
      intentConfidence: 0.96,
      needKnowledge: false,
      needTaskResolution: false,
      toolPlan: "none",
      topicShift: false
    });
  });

  it("teaches the model to answer general knowledge directly without hitting company knowledge", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                mode: "open_response",
                intentConfidence: 0.94,
                needKnowledge: false,
                needTaskResolution: false,
                toolPlan: "none",
                topicShift: false,
                reply: "如果你想轻松一点，我建议按故宫、中轴线、长城、颐和园、胡同这样安排。"
              })
            }
          }
        ]
      })
    });

    const classifier = createModelIntentClassifier({
      apiKey: "test-key",
      baseUrl: "https://api.siliconflow.cn/v1",
      model: "Qwen/Qwen3-8B",
      fetch: fetchMock
    });

    await classifier.classify({
      query: "北京七日游攻略"
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ role: string; content: string }>;
    };

    expect(requestBody.messages[0]?.content).toContain("open_response");
    expect(requestBody.messages[0]?.content).toContain("北京七日游攻略");
    expect(requestBody.messages[0]?.content).toContain("禁止查阅公司内部知识库");
    expect(requestBody.messages[0]?.content).toContain("如果 mode 是 open_response，必须返回 reply 字段");
    expect(requestBody.messages[0]?.content).toContain('用户：“你好”');
    expect(requestBody.messages[0]?.content).toContain('用户：“北京七日游攻略”');
  });

  it("teaches the model to emit reply for open_response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                mode: "open_response",
                intentConfidence: 0.97,
                needKnowledge: false,
                needTaskResolution: false,
                toolPlan: "none",
                topicShift: false,
                reply: "我可以帮你查公司制度说明、找常用办理入口。"
              })
            }
          }
        ]
      })
    });

    const classifier = createModelIntentClassifier({
      apiKey: "test-key",
      baseUrl: "https://api.siliconflow.cn/v1",
      model: "Qwen/Qwen3-8B",
      fetch: fetchMock
    });

    await classifier.classify({
      query: "你能做什么"
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{ role: string; content: string }>;
    };

    expect(requestBody.messages[0]?.content).toContain("如果 mode 是 open_response，必须返回 reply 字段");
    expect(requestBody.messages[0]?.content).toContain("如果 mode 不是 open_response，不要返回 reply 字段");
  });


  it("returns a clarify fallback when the model payload is not a supported decision", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                mode: "not-supported"
              })
            }
          }
        ]
      })
    });

    const classifier = createModelIntentClassifier({
      apiKey: "test-key",
      baseUrl: "https://api.siliconflow.cn/v1",
      model: "Qwen/Qwen3-8B",
      fetch: fetchMock
    });

    await expect(classifier.classify("这个怎么办")).resolves.toEqual({
      mode: "clarify",
      intentConfidence: 0,
      needKnowledge: false,
      needTaskResolution: false,
      toolPlan: "none",
      topicShift: false,
      clarifyQuestion: "我先确认一下，你是想查制度说明，还是想办理流程？"
    });
  });

  it("returns a clarify fallback when fetch rejects", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const classifier = createModelIntentClassifier({
      apiKey: "test-key",
      baseUrl: "https://api.siliconflow.cn/v1",
      model: "Qwen/Qwen3-8B",
      fetch: vi.fn().mockRejectedValue(new Error("network down"))
    });

    await expect(classifier.classify("这个怎么办")).resolves.toEqual({
      mode: "clarify",
      intentConfidence: 0,
      needKnowledge: false,
      needTaskResolution: false,
      toolPlan: "none",
      topicShift: false,
      clarifyQuestion: "当前系统开小差了，请稍后再试。"
    });
    expect(infoSpy).toHaveBeenCalledWith(
      '[siliconflow] request model="Qwen/Qwen3-8B" query="这个怎么办" hasImage=false'
    );
    expect(warnSpy).toHaveBeenCalledWith(
      '[siliconflow] response mode=clarify query="这个怎么办" reason="network down"'
    );
  });

  it("returns a clarify fallback when response json parsing throws", async () => {
    const classifier = createModelIntentClassifier({
      apiKey: "test-key",
      baseUrl: "https://api.siliconflow.cn/v1",
      model: "Qwen/Qwen3-8B",
      fetch: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error("bad json");
        }
      })
    });

    await expect(classifier.classify("这个怎么办")).resolves.toEqual({
      mode: "clarify",
      intentConfidence: 0,
      needKnowledge: false,
      needTaskResolution: false,
      toolPlan: "none",
      topicShift: false,
      clarifyQuestion: "当前系统开小差了，请稍后再试。"
    });
  });

  it("returns a clarify fallback with the error copy when the model response is not ok", async () => {
    const classifier = createModelIntentClassifier({
      apiKey: "test-key",
      baseUrl: "https://api.siliconflow.cn/v1",
      model: "Qwen/Qwen3-8B",
      fetch: vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Service Unavailable"
      })
    });

    await expect(classifier.classify("这个怎么办")).resolves.toEqual({
      mode: "clarify",
      intentConfidence: 0,
      needKnowledge: false,
      needTaskResolution: false,
      toolPlan: "none",
      topicShift: false,
      clarifyQuestion: "当前系统开小差了，请稍后再试。"
    });
  });
});
