import { describe, expect, it, vi } from "vitest";

import type { IntentType } from "./intent.types";
import { createIntentAnalyzer } from "./intent-analyzer";

describe("createIntentAnalyzer", () => {
  it.each([
    ["我要请假", "task_request"],
    ["请假流程是什么", "task_request"],
    ["年假规则是什么", "knowledge_query"],
    ["帮我找行政", "handoff_request"],
    ["你好", "smalltalk"]
  ] satisfies Array<[string, IntentType]>)(
    "classifies %s as %s with rules",
    async (query, expected) => {
      const modelClassifier = {
        classify: vi.fn().mockResolvedValue("unknown" satisfies IntentType)
      };

      const analyzer = createIntentAnalyzer({ modelClassifier });
      const result = await analyzer.analyze(query);

      expect(result.intent).toBe(expected);
      expect(result.source).toBe("rule");
      expect(modelClassifier.classify).not.toHaveBeenCalled();
    }
  );

  it("returns unknown for ambiguous input when model fallback is disabled", async () => {
    const analyzer = createIntentAnalyzer();

    const result = await analyzer.analyze("这个呢");

    expect(result.intent).toBe("unknown");
    expect(result.source).toBe("none");
  });

  it("falls back to model classification for ambiguous input", async () => {
    const modelClassifier = {
      classify: vi.fn().mockResolvedValue("knowledge_query" satisfies IntentType)
    };

    const analyzer = createIntentAnalyzer({ modelClassifier });
    const result = await analyzer.analyze("这个怎么办");

    expect(modelClassifier.classify).toHaveBeenCalledWith("这个怎么办");
    expect(result).toEqual({
      intent: "knowledge_query",
      source: "model"
    });
  });

  it("returns unknown when model fallback throws", async () => {
    const analyzer = createIntentAnalyzer({
      modelClassifier: {
        classify: vi.fn().mockRejectedValue(new Error("model failed"))
      }
    });

    const result = await analyzer.analyze("这个怎么办");

    expect(result).toEqual({
      intent: "unknown",
      source: "model"
    });
  });
});
