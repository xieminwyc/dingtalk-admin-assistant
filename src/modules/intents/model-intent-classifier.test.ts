import { describe, expect, it, vi } from "vitest";

import { createModelIntentClassifier } from "./model-intent-classifier";

describe("createModelIntentClassifier", () => {
  it("parses SiliconFlow chat completions response into an intent", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: "task_request"
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

    const result = await classifier.classify("我要请假");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.siliconflow.cn/v1/chat/completions"
    );
    expect(result).toBe("task_request");
  });

  it("returns unknown when the model payload is not a supported intent", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: "not-supported"
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

    await expect(classifier.classify("这个怎么办")).resolves.toBe("unknown");
  });
});
