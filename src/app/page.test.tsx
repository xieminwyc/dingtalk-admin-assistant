import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import Home from "./page";

describe("Home", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("renders the five homepage entry cards", () => {
    render(<Home />);

    expect(screen.getByRole("button", { name: /历史记录/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
    expect(screen.getByText("找制度")).toBeInTheDocument();
    expect(screen.getByText("找对接人")).toBeInTheDocument();
    expect(screen.getByText("找流程")).toBeInTheDocument();
    expect(screen.getByText("发票识别")).toBeInTheDocument();
    expect(screen.getByText("帮我写作")).toBeInTheDocument();
  });

  it("keeps homepage cards visually concise", () => {
    render(<Home />);

    expect(screen.getByText("问财务、问行政")).toBeInTheDocument();
    expect(screen.queryByText("快速定位制度依据")).not.toBeInTheDocument();
    expect(screen.queryByText("快速找到负责同事")).not.toBeInTheDocument();
  });

  it("keeps the homepage hero copy compact", () => {
    render(<Home />);

    expect(screen.getByText("今天想先处理什么？")).toBeInTheDocument();
    expect(screen.getByText("选一个入口，或直接发消息")).toBeInTheDocument();
    expect(
      screen.queryByText("我是万事通，您的全能 AI 工作搭子"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "我能帮你查制度、找对接人、找流程，也可以协助你写作。后续图片生成等能力也会继续接进来。",
      ),
    ).not.toBeInTheDocument();
  });

  it("keeps the composer above teammates on the homepage", () => {
    render(<Home />);

    const composer = screen.getByLabelText("输入消息");
    const teammatesHeading = screen.getByRole("heading", { name: /同事们/i });

    expect(
      composer.compareDocumentPosition(teammatesHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("enters drilldown view after clicking a homepage entry card", async () => {
    const user = userEvent.setup();

    render(<Home />);

    await user.click(screen.getByText("找制度"));

    expect(screen.getByText("找制度专家模式")).toBeInTheDocument();
  });

  it("returns to the homepage from drilldown", async () => {
    const user = userEvent.setup();

    render(<Home />);

    await user.click(screen.getByText("找制度"));
    await user.click(screen.getByRole("button", { name: "返回首页" }));

    expect(screen.getByText("找对接人")).toBeInTheDocument();
  });

  it("renders template-driven drilldown content for homepage entries", async () => {
    const user = userEvent.setup();

    render(<Home />);

    await user.click(screen.getByText("找制度"));

    expect(screen.getByText("推荐查询方案")).toBeInTheDocument();
    expect(screen.getByText("查询差旅报销标准")).toBeInTheDocument();
  });

  it("opens the history drawer and renders saved conversation summaries", async () => {
    const user = userEvent.setup();

    window.localStorage.setItem(
      "homepage-session",
      JSON.stringify({
        currentSessionId: "home-1",
        sessions: [
          {
            sessionId: "home-1",
            title: "报销单被退回应该联系谁？",
            updatedAt: Date.now(),
            messages: [
              {
                id: "m1",
                role: "user",
                content: "报销单被退回应该联系谁？",
              },
            ],
          },
        ],
      }),
    );

    render(<Home />);

    await user.click(screen.getByRole("button", { name: /历史记录/i }));

    const historyDrawer = screen
      .getByRole("heading", { name: "历史记录" })
      .closest("aside");

    expect(historyDrawer).not.toBeNull();
    expect(within(historyDrawer!).getByText("开启新话题")).toBeInTheDocument();
    expect(within(historyDrawer!).getByText("报销单被退回应该联系谁？")).toBeInTheDocument();
  });

  it("restores a saved conversation when clicking a history record", async () => {
    const user = userEvent.setup();

    window.localStorage.setItem(
      "homepage-session",
      JSON.stringify({
        currentSessionId: "home-2",
        sessions: [
          {
            sessionId: "home-2",
            title: "今天要写什么周报？",
            updatedAt: Date.now(),
            messages: [
              {
                id: "m2",
                role: "user",
                content: "今天要写什么周报？",
              },
            ],
          },
          {
            sessionId: "home-1",
            title: "报销单被退回应该联系谁？",
            updatedAt: Date.now() - 1000,
            messages: [
              {
                id: "m1",
                role: "user",
                content: "报销单被退回应该联系谁？",
              },
              {
                id: "m1a",
                role: "assistant",
                content: "请联系财务同学处理报销退回问题。",
              },
            ],
          },
        ],
      }),
    );

    render(<Home />);

    await user.click(screen.getByRole("button", { name: /历史记录/i }));
    await user.click(
      screen.getByRole("button", {
        name: /报销单被退回应该联系谁/,
      }),
    );

    expect(screen.getByText("请联系财务同学处理报销退回问题。")).toBeInTheDocument();
  });

  it("fills example question into input without sending when clicked", async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, "fetch");

    render(<Home />);

    await user.click(
      screen.getByRole("button", { name: "报销单被退回应该联系谁？" }),
    );

    // text should appear in the input box
    expect(screen.getByLabelText("输入消息")).toHaveValue("报销单被退回应该联系谁？");
    // fetch should NOT have been called because we only fill, not send
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("shows an explicit placeholder state for invoice OCR", async () => {
    const user = userEvent.setup();

    render(<Home />);

    await user.click(screen.getByText("发票识别"));

    expect(
      screen.getByText("发票识别能力尚未上线。我可以先帮你整理票据类型、识别字段和使用场景，等 OCR 能力接入后可直接复用。"),
    ).toBeInTheDocument();
  });

  it("sends the contact example question with entryMode contact when user submits manually", async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          reply: "请联系财务同学处理报销退回问题。",
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
      screen.getByRole("button", { name: "报销单被退回应该联系谁？" }),
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
      screen.getByText("请联系财务同学处理报销退回问题。"),
    ).toBeInTheDocument();
  });

  it("shows active conversation chrome and lets the user return home from chat", async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          reply: "请联系财务同学处理报销退回问题。",
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

    await user.click(
      screen.getByRole("button", { name: "报销单被退回应该联系谁？" }),
    );
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByText("ACTIVE CONVERSATION")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "返回首页" }));

    expect(screen.getByText("帮我写作")).toBeInTheDocument();
  });

  it("renders layered knowledge results with citations and a mode badge", async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          reply:
            "知识主题\n年假制度\n\n结论\n满一年可享受年假。\n\n适用范围\n以制度原文为准。\n\n依据\n《假勤管理办法》",
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

    await user.click(screen.getByText("找制度"));
    await user.type(screen.getByLabelText("输入消息"), "年假制度是什么{enter}");

    await waitFor(() => {
      expect(screen.getByText("依据来源")).toBeInTheDocument();
    });

    expect(screen.getByText("《假勤管理办法》")).toBeInTheDocument();
    expect(screen.getByText("KNOWLEDGE")).toBeInTheDocument();
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
