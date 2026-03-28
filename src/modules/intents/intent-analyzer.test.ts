import { afterEach, describe, expect, it, vi } from "vitest";

import type { AssistantDecision } from "./intent.types";
import { createIntentAnalyzer } from "./intent-analyzer";

describe("createIntentAnalyzer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the model decision for chat requests", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const analyzer = createIntentAnalyzer({
      modelClassifier: {
        classify: vi.fn().mockResolvedValue({
          mode: "chat",
          intentConfidence: 0.96,
          needKnowledge: false,
          needTaskResolution: false,
          topicShift: false
        } satisfies AssistantDecision)
      }
    });

    const result = await analyzer.analyze({
      query: "你是谁"
    });

    expect(result).toEqual({
      mode: "chat",
      intentConfidence: 0.96,
      needKnowledge: false,
      needTaskResolution: false,
      topicShift: false,
      intent: "smalltalk",
      source: "model"
    });
    expect(infoSpy).toHaveBeenCalledWith(
      '[intent] source=model mode=chat query="你是谁"'
    );
  });

  it("passes conversation context to the model decision engine", async () => {
    const modelClassifier = {
      classify: vi.fn().mockResolvedValue({
        mode: "task",
        intentConfidence: 0.91,
        needKnowledge: false,
        needTaskResolution: true,
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
          mode: "chat",
          intentConfidence: 0.42,
          needKnowledge: false,
          needTaskResolution: false,
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
      mode: "chat",
      intentConfidence: 0.42,
      needKnowledge: false,
      needTaskResolution: false,
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
      topicShift: false,
      clarifyQuestion: "你是想查制度说明，还是想办理流程？",
      intent: "unknown",
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
      topicShift: false,
      clarifyQuestion: "我先确认一下，你是想查制度说明，还是想办理流程？",
      intent: "unknown",
      source: "fallback"
    });
    expect(warnSpy).toHaveBeenCalledWith(
      '[intent] source=fallback mode=clarify query="这个怎么办" reason="model failed"'
    );
  });
});
