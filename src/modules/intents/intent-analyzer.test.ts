import { afterEach, describe, expect, it, vi } from "vitest";

import type { AssistantDecision } from "./intent.types";
import { createIntentAnalyzer } from "./intent-analyzer";

describe("createIntentAnalyzer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the model decision for open-response requests", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const analyzer = createIntentAnalyzer({
      modelClassifier: {
        classify: vi.fn().mockResolvedValue({
          mode: "open_response",
          intentConfidence: 0.96,
          needKnowledge: false,
          needTaskResolution: false,
          toolPlan: "none",
          topicShift: false
        } satisfies AssistantDecision)
      }
    });

    const result = await analyzer.analyze({
      query: "你是谁"
    });

    expect(result).toEqual({
      mode: "open_response",
      intentConfidence: 0.96,
      needKnowledge: false,
      needTaskResolution: false,
      toolPlan: "none",
      topicShift: false,
      intent: "smalltalk",
      source: "model"
    });
    expect(infoSpy).toHaveBeenCalledWith(
      '[intent] source=model mode=open_response query="你是谁"'
    );
  });

  it("passes conversation context to the model decision engine", async () => {
    const modelClassifier = {
      classify: vi.fn().mockResolvedValue({
        mode: "task",
        intentConfidence: 0.91,
        needKnowledge: false,
        needTaskResolution: true,
        toolPlan: "task",
        topicShift: false,
        taskHint: "leave_application"
      } satisfies AssistantDecision)
    };

    const analyzer = createIntentAnalyzer({ modelClassifier });
    const result = await analyzer.analyze({
      query: "那请假怎么申请",
      conversationContext: [
        { role: "user", content: "你能做什么？" },
        { role: "assistant", content: "我可以帮你查制度、找办理入口。" }
      ]
    });

    expect(modelClassifier.classify).toHaveBeenCalledWith({
      query: "那请假怎么申请",
      conversationContext: [
        { role: "user", content: "你能做什么？" },
        { role: "assistant", content: "我可以帮你查制度、找办理入口。" }
      ]
    });
    expect(result).toEqual({
      mode: "task",
      intentConfidence: 0.91,
      needKnowledge: false,
      needTaskResolution: true,
      toolPlan: "task",
      topicShift: false,
      taskHint: "leave_application",
      intent: "task_request",
      source: "model"
    });
  });

  it("keeps topic shift signals when the user breaks away from the previous task", async () => {
    const analyzer = createIntentAnalyzer({
      modelClassifier: {
        classify: vi.fn().mockResolvedValue({
          mode: "open_response",
          intentConfidence: 0.42,
          needKnowledge: false,
          needTaskResolution: false,
          toolPlan: "none",
          topicShift: true,
          contextBreakConfidence: 0.91
        } satisfies AssistantDecision)
      }
    });

    const result = await analyzer.analyze({
      query: "那明天下雨吗？",
      conversationContext: [
        { role: "user", content: "我要请假" },
        { role: "assistant", content: "你可以走请假申请入口。" }
      ]
    });

    expect(result).toEqual({
      mode: "open_response",
      intentConfidence: 0.42,
      needKnowledge: false,
      needTaskResolution: false,
      toolPlan: "none",
      topicShift: true,
      contextBreakConfidence: 0.91,
      intent: "smalltalk",
      source: "model"
    });
  });

  it("accepts low-confidence clarify decisions from the model", async () => {
    const analyzer = createIntentAnalyzer({
      modelClassifier: {
        classify: vi.fn().mockResolvedValue({
          mode: "clarify",
          intentConfidence: 0.18,
          needKnowledge: false,
          needTaskResolution: false,
          toolPlan: "none",
          topicShift: false,
          clarifyQuestion: "你是想查制度说明，还是想办理流程？"
        } satisfies AssistantDecision)
      }
    });

    const result = await analyzer.analyze({
      query: "这个怎么办"
    });

    expect(result).toEqual({
      mode: "clarify",
      intentConfidence: 0.18,
      needKnowledge: false,
      needTaskResolution: false,
      toolPlan: "none",
      topicShift: false,
      clarifyQuestion: "你是想查制度说明，还是想办理流程？",
      intent: "unknown",
      source: "model"
    });
  });

  it("corrects descriptive process questions back to internal knowledge when the model mislabels them as task", async () => {
    const analyzer = createIntentAnalyzer({
      modelClassifier: {
        classify: vi.fn().mockResolvedValue({
          mode: "task",
          intentConfidence: 0.88,
          needKnowledge: false,
          needTaskResolution: true,
          toolPlan: "task",
          topicShift: false,
          taskHint: "expense_application"
        } satisfies AssistantDecision)
      }
    });

    const result = await analyzer.analyze({
      query: "报销流程是什么"
    });

    expect(result).toEqual({
      mode: "internal_knowledge",
      intentConfidence: 0.88,
      needKnowledge: true,
      needTaskResolution: false,
      toolPlan: "knowledge",
      topicShift: false,
      knowledgeHint: "报销流程",
      intent: "knowledge_query",
      source: "model"
    });
  });

  it("corrects obvious company knowledge queries back to internal knowledge when the model mislabels them as open_response", async () => {
    const analyzer = createIntentAnalyzer({
      modelClassifier: {
        classify: vi.fn().mockResolvedValue({
          mode: "open_response",
          intentConfidence: 0.79,
          needKnowledge: false,
          needTaskResolution: false,
          toolPlan: "none",
          topicShift: false,
          reply: "你可以先补充一点背景。"
        } satisfies AssistantDecision)
      }
    });

    const result = await analyzer.analyze({
      query: "OA 费用报销申请怎么填"
    });

    expect(result).toEqual({
      mode: "internal_knowledge",
      intentConfidence: 0.79,
      needKnowledge: true,
      needTaskResolution: false,
      toolPlan: "knowledge",
      topicShift: false,
      knowledgeHint: "OA 费用报销申请怎么填",
      intent: "knowledge_query",
      source: "model"
    });
  });

  it("keeps obvious company form-filling questions on internal knowledge", async () => {
    const analyzer = createIntentAnalyzer({
      modelClassifier: {
        classify: vi.fn().mockResolvedValue({
          mode: "open_response",
          intentConfidence: 0.74,
          needKnowledge: false,
          needTaskResolution: false,
          toolPlan: "none",
          topicShift: false,
          reply: "你可以说得更具体一点。"
        } satisfies AssistantDecision)
      }
    });

    const result = await analyzer.analyze({
      query: "考勤异常怎么填"
    });

    expect(result).toEqual({
      mode: "internal_knowledge",
      intentConfidence: 0.74,
      needKnowledge: true,
      needTaskResolution: false,
      toolPlan: "knowledge",
      topicShift: false,
      knowledgeHint: "考勤异常怎么填",
      intent: "knowledge_query",
      source: "model"
    });
  });

  it("keeps short follow-up questions on company policy in internal knowledge when previous turns are knowledge discussion", async () => {
    const analyzer = createIntentAnalyzer({
      modelClassifier: {
        classify: vi.fn().mockResolvedValue({
          mode: "open_response",
          intentConfidence: 0.67,
          needKnowledge: false,
          needTaskResolution: false,
          toolPlan: "none",
          topicShift: false,
          reply: "上班时间通常要看公司规定。"
        } satisfies AssistantDecision)
      }
    });

    const result = await analyzer.analyze({
      query: "那上班时间呢",
      conversationContext: [
        { role: "user", content: "报销流程是什么" },
        { role: "assistant", content: "报销流程如下，并附有制度依据。" }
      ]
    });

    expect(result).toEqual({
      mode: "internal_knowledge",
      intentConfidence: 0.67,
      needKnowledge: true,
      needTaskResolution: false,
      toolPlan: "knowledge",
      topicShift: false,
      knowledgeHint: "上班时间",
      intent: "knowledge_query",
      source: "model"
    });
  });

  it("keeps short follow-up questions like late-arrival policy in internal knowledge when previous turns are knowledge discussion", async () => {
    const analyzer = createIntentAnalyzer({
      modelClassifier: {
        classify: vi.fn().mockResolvedValue({
          mode: "open_response",
          intentConfidence: 0.66,
          needKnowledge: false,
          needTaskResolution: false,
          toolPlan: "none",
          topicShift: false,
          reply: "这通常要看公司制度。"
        } satisfies AssistantDecision)
      }
    });

    const result = await analyzer.analyze({
      query: "那迟到呢",
      conversationContext: [
        { role: "user", content: "上班时间是什么" },
        { role: "assistant", content: "我来按制度给你查。" }
      ]
    });

    expect(result).toEqual({
      mode: "internal_knowledge",
      intentConfidence: 0.66,
      needKnowledge: true,
      needTaskResolution: false,
      toolPlan: "knowledge",
      topicShift: false,
      knowledgeHint: "迟到",
      intent: "knowledge_query",
      source: "model"
    });
  });

  it("falls back to a conservative clarify decision when the model throws", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const analyzer = createIntentAnalyzer({
      modelClassifier: {
        classify: vi.fn().mockRejectedValue(new Error("model failed"))
      }
    });

    const result = await analyzer.analyze({
      query: "这个怎么办"
    });

    expect(result).toEqual({
      mode: "clarify",
      intentConfidence: 0,
      needKnowledge: false,
      needTaskResolution: false,
      toolPlan: "none",
      topicShift: false,
      clarifyQuestion: "当前系统开小差了，请稍后再试。",
      intent: "unknown",
      source: "fallback"
    });
    expect(warnSpy).toHaveBeenCalledWith(
      '[intent] source=fallback mode=clarify query="这个怎么办" reason="model failed"'
    );
  });
});
