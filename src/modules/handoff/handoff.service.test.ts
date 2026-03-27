import { describe, expect, it } from "vitest";

import { evaluateHandoff } from "./handoff.service";

describe("evaluateHandoff", () => {
  it("does not require handoff for a confident FAQ hit", () => {
    const handoff = evaluateHandoff({
      hitCount: 1,
      topScore: 0.96
    });

    expect(handoff.required).toBe(false);
  });

  it("requires handoff when no reliable knowledge is found", () => {
    const handoff = evaluateHandoff({
      hitCount: 0,
      topScore: 0
    });

    expect(handoff.required).toBe(true);
    expect(handoff.reason).toContain("未找到");
  });
});
