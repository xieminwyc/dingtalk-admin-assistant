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

  it("fills example question into input without sending when clicked", async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, "fetch");

    render(<Home />);

    await user.click(
      screen.getByRole("button", { name: "PMS制卡问题应该找谁处理？" }),
    );

    // text should appear in the input box
    expect(screen.getByLabelText("输入消息")).toHaveValue(
      "PMS制卡问题应该找谁处理？",
    );
    // fetch should NOT have been called because we only fill, not send
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("sends the contact example question with entryMode contact when user submits manually", async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          reply: "请联系门店系统支持同学处理 PMS 制卡问题。",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    render(<Home />);

    // Click example → fills input
    await user.click(
      screen.getByRole("button", { name: "PMS制卡问题应该找谁处理？" }),
    );

    // Then submit with Enter
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/dingtalk/webhook",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"entryMode":"contact"'),
      }),
    );
    expect(
      screen.getByText("请联系门店系统支持同学处理 PMS 制卡问题。"),
    ).toBeInTheDocument();
  });

  it("shows a thinking animation before the reply resolves", async () => {
    const user = userEvent.setup();
    let resolveFetch: ((value: Response) => void) | undefined;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });

    vi.spyOn(globalThis, "fetch").mockReturnValue(fetchPromise);

    render(<Home />);

    await user.type(screen.getByLabelText("输入消息"), "帮我写一份周报{enter}");

    // thinking dots container should be visible
    expect(document.querySelector(".portal-thinking-dots")).not.toBeNull();

    resolveFetch?.(
      new Response(
        JSON.stringify({
          reply: "这是本周周报初稿。",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    await waitFor(() => {
      expect(screen.getByText("这是本周周报初稿。")).toBeInTheDocument();
    });
    expect(document.querySelector(".portal-thinking-dots")).toBeNull();
  });
});
