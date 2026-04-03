import { describe, expect, it, vi } from "vitest";

import { createStreamReplyAccumulator } from "./home-shell.stream";

describe("createStreamReplyAccumulator", () => {
  it("batches multiple chunk updates into a single flush", async () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    const accumulator = createStreamReplyAccumulator({ onFlush });

    accumulator.push("公");
    accumulator.push("司");
    accumulator.push("制度");

    expect(onFlush).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith("公司制度");

    vi.useRealTimers();
  });

  it("flushes the buffered reply immediately when finalize is called", () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    const accumulator = createStreamReplyAccumulator({ onFlush });

    accumulator.push("报销");
    accumulator.push("流程");
    accumulator.finalize();

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith("报销流程");

    vi.useRealTimers();
  });
});
