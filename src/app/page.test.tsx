import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import Home from "./page";

describe("Home", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the five homepage entry cards", () => {
    render(<Home />);

    expect(screen.getByText("找制度")).toBeInTheDocument();
    expect(screen.getByText("找对接人")).toBeInTheDocument();
    expect(screen.getByText("找流程")).toBeInTheDocument();
    expect(screen.getByText("图片生成")).toBeInTheDocument();
    expect(screen.getByText("帮我写作")).toBeInTheDocument();
  });

  it("sends the contact example question with entryMode contact", async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          reply: "请联系门店系统支持同学处理 PMS 制卡问题。"
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      )
    );

    render(<Home />);

    await user.click(screen.getByRole("button", { name: "PMS制卡问题应该找谁处理？" }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/dingtalk/webhook",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"entryMode\":\"contact\"")
      })
    );
    expect(screen.getByText("请联系门店系统支持同学处理 PMS 制卡问题。")).toBeInTheDocument();
  });

  it("shows a thinking state before the reply resolves", async () => {
    const user = userEvent.setup();
    let resolveFetch: ((value: Response) => void) | undefined;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });

    vi.spyOn(globalThis, "fetch").mockReturnValue(fetchPromise);

    render(<Home />);

    await user.type(screen.getByLabelText("输入消息"), "帮我写一份周报{enter}");

    expect(screen.getByText("AI 正在思考...")).toBeInTheDocument();

    resolveFetch?.(
      new Response(
        JSON.stringify({
          reply: "这是本周周报初稿。"
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      )
    );

    await waitFor(() => {
      expect(screen.getByText("这是本周周报初稿。")).toBeInTheDocument();
    });
    expect(screen.queryByText("AI 正在思考...")).not.toBeInTheDocument();
  });
});
