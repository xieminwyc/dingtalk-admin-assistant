import { afterEach, describe, expect, it, vi } from "vitest";

import { createModelIntentClassifier } from "./model-intent-classifier";

describe("createModelIntentClassifier", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses SiliconFlow chat completions response into an intent", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
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
    expect(infoSpy).toHaveBeenNthCalledWith(
      1,
      '[siliconflow] request model="Qwen/Qwen3-8B" query="我要请假"'
    );
    expect(infoSpy).toHaveBeenNthCalledWith(
      2,
      '[siliconflow] response intent=task_request query="我要请假"'
    );
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

  it("returns unknown when fetch rejects", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const classifier = createModelIntentClassifier({
      apiKey: "test-key",
      baseUrl: "https://api.siliconflow.cn/v1",
      model: "Qwen/Qwen3-8B",
      fetch: vi.fn().mockRejectedValue(new Error("network down"))
    });

    await expect(classifier.classify("这个怎么办")).resolves.toBe("unknown");
    expect(infoSpy).toHaveBeenCalledWith(
      '[siliconflow] request model="Qwen/Qwen3-8B" query="这个怎么办"'
    );
    expect(warnSpy).toHaveBeenCalledWith(
      '[siliconflow] response intent=unknown query="这个怎么办" reason="network down"'
    );
  });

  it("returns unknown when response json parsing throws", async () => {
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

    await expect(classifier.classify("这个怎么办")).resolves.toBe("unknown");
  });
});
