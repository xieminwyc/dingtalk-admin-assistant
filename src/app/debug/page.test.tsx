import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DebugPage from "./page";

describe("DebugPage", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          reply: "根据《员工假勤管理办法》，年假天数按司龄计算。",
          debug: {
            intent: {
              mode: "internal_knowledge",
              source: "model",
              toolPlan: "knowledge",
              knowledgeHint: "年假规则"
            },
            resolution: {
              kind: "knowledge",
              referenceLabel: "员工假勤管理办法 - 年假"
            },
            usedResponseGenerator: true
          }
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      )
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the browser debug chat workbench", () => {
    render(<DebugPage />);

    expect(screen.getByText("网页调试聊天")).toBeInTheDocument();
    expect(screen.getByText("本轮调试信息")).toBeInTheDocument();
    expect(screen.getByText("resolution.kind")).toBeInTheDocument();
    expect(screen.getByText("usedResponseGenerator")).toBeInTheDocument();
  });

  it("sends a debug chat request and renders the returned debug metadata", async () => {
    const user = userEvent.setup();

    render(<DebugPage />);

    await user.type(screen.getByLabelText("输入消息"), "年假规则是什么");
    await user.click(screen.getByRole("button", { name: "发送并调试" }));

    await waitFor(() => {
      expect(screen.getByText("根据《员工假勤管理办法》，年假天数按司龄计算。")).toBeInTheDocument();
    });

    expect(screen.getByText("internal_knowledge")).toBeInTheDocument();
    expect(screen.getAllByText("knowledge")).toHaveLength(2);
    expect(screen.getByText("员工假勤管理办法 - 年假")).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/dingtalk/webhook",
      expect.objectContaining({
        method: "POST"
      })
    );
  });

  it("submits the current message when pressing Enter", async () => {
    const user = userEvent.setup();

    render(<DebugPage />);

    await user.type(screen.getByLabelText("输入消息"), "深圳天气怎么样{enter}");

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/dingtalk/webhook",
      expect.objectContaining({
        method: "POST"
      })
    );
  });
});
