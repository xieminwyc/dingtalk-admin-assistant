export type HandoffDecision = {
  required: boolean;
  reason?: string;
};

export function evaluateHandoff(input: {
  hitCount: number;
  topScore: number;
}): HandoffDecision {
  // 一期边界策略非常保守：没命中或分数太低，都优先转人工。
  if (input.hitCount === 0 || input.topScore < 0.6) {
    return {
      required: true,
      reason: "当前未找到可靠知识，请联系行政同学。",
    };
  }

  return {
    required: false,
  };
}
