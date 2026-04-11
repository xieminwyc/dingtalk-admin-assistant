import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import Home from "./page";

function buildSseResponse(events: unknown[]) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
      },
    },
  );
}

describe("Home", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.history.replaceState({}, "", "/");
    delete (window as Window & { dd?: unknown }).dd;
    delete (window as Window & { DingTalkPC?: unknown }).DingTalkPC;
    delete process.env.DINGTALK_CLIENT_ID;
    delete process.env.DINGTALK_CORP_ID;
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
      "/api/dingtalk/webhook/stream",
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

  it("keeps new topic actions out of the composer once chat is active", async () => {
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

    expect(
      screen.getByRole("button", { name: "返回首页" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "新对话" }),
    ).not.toBeInTheDocument();
  });

  it("renders layered knowledge results with citations and a mode badge", async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      buildSseResponse([
        {
          type: "chunk",
          content: "知识主题\n年假制度\n\n",
        },
        {
          type: "chunk",
          content: "结论\n满一年可享受年假。\n\n适用范围\n以制度原文为准。",
        },
        {
          type: "done",
          reply:
            "知识主题\n年假制度\n\n结论\n满一年可享受年假。\n\n适用范围\n以制度原文为准。",
          kind: "knowledge",
          citations: [
            {
              documentTitle: "《假勤管理办法》",
              sourceUrl: "https://alidocs.dingtalk.com/i/nodes/leave-rule",
            },
          ],
        },
      ]),
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

  it("consumes the homepage stream endpoint and appends reply chunks before done metadata", async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      buildSseResponse([
        {
          type: "chunk",
          content: "报销",
        },
        {
          type: "chunk",
          content: "流程如下。",
        },
        {
          type: "done",
          reply: "报销流程如下。",
          kind: "knowledge",
          citations: [
            {
              documentTitle: "费用报销制度",
              sourceUrl: "https://alidocs.dingtalk.com/i/nodes/reimburse",
            },
          ],
        },
      ]),
    );

    render(<Home />);

    await user.click(screen.getByText("找制度"));
    await user.type(screen.getByLabelText("输入消息"), "报销流程是什么{enter}");

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/dingtalk/webhook/stream",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText("报销流程如下。")).toBeInTheDocument();
    });
    expect(screen.getByText("费用报销制度")).toBeInTheDocument();
  });

  it("accepts multiple pasted images and sends imageUrls to the homepage stream endpoint", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      buildSseResponse([
        {
          type: "chunk",
          content: "这是一张报销凭证截图。",
        },
        {
          type: "done",
          reply: "这是一张报销凭证截图。",
          kind: "open_response",
        },
      ]),
    );

    render(<Home />);

    const input = screen.getByLabelText("输入消息");
    const firstFile = new File(["image-bytes-1"], "receipt-1.png", {
      type: "image/png",
    });
    const secondFile = new File(["image-bytes-2"], "receipt-2.png", {
      type: "image/png",
    });

    await user.click(input);
    fireEvent.paste(input, {
      clipboardData: {
        items: [
          {
            kind: "file",
            type: firstFile.type,
            getAsFile: () => firstFile,
          },
          {
            kind: "file",
            type: secondFile.type,
            getAsFile: () => secondFile,
          },
        ],
      },
    });

    await waitFor(() => {
      expect(screen.getByRole("img", { name: "receipt-1.png" })).toBeInTheDocument();
      expect(screen.getByRole("img", { name: "receipt-2.png" })).toBeInTheDocument();
    });
    expect(screen.getAllByRole("button", { name: "移除" })).toHaveLength(2);

    await user.type(input, "帮我看看这是什么{enter}");

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/dingtalk/webhook/stream",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });

    const request = fetchSpy.mock.calls.find(
      ([url]) => url === "/api/dingtalk/webhook/stream",
    );
    const body = JSON.parse(String(request?.[1]?.body)) as {
      imageUrls?: string[];
      text?: { content?: string };
    };

    expect(body.text?.content).toBe("帮我看看这是什么");
    expect(body.imageUrls).toHaveLength(2);
    expect(body.imageUrls?.[0]).toMatch(/^data:image\/png;base64,/);
    expect(body.imageUrls?.[1]).toMatch(/^data:image\/png;base64,/);

    await waitFor(() => {
      expect(screen.queryAllByRole("button", { name: "移除" })).toHaveLength(0);
    });
  });

  it("includes senderStaffId in the homepage stream request when the browser already knows the current user", async () => {
    const user = userEvent.setup();

    window.history.replaceState(
      {},
      "",
      "/?senderStaffId=0215084121561138029",
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      buildSseResponse([
        {
          type: "chunk",
          content: "报销",
        },
        {
          type: "done",
          reply: "报销",
        },
      ]),
    );

    render(<Home />);

    await user.click(screen.getByText("找制度"));
    await user.type(screen.getByLabelText("输入消息"), "报销流程是什么{enter}");

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/dingtalk/webhook/stream",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining(
          '"senderStaffId":"0215084121561138029"',
        ),
      }),
    );
  });

  it("exchanges authCode and includes senderStaffId in the homepage stream request", async () => {
    const user = userEvent.setup();

    process.env.DINGTALK_CLIENT_ID = "ding-app-key";
    window.history.replaceState({}, "", "/?authCode=auth-code-1");

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (input === "/api/dingtalk/browser-identity") {
        return Response.json({
          senderStaffId: "0215084121561138029",
        });
      }

      if (input === "/api/dingtalk/webhook/stream") {
        return buildSseResponse([
          {
            type: "chunk",
            content: "报销",
          },
          {
            type: "done",
            reply: "报销",
          },
        ]);
      }

      throw new Error(`Unexpected fetch: ${String(input)}`);
    });

    render(<Home />);

    await user.click(screen.getByText("找制度"));
    await user.type(screen.getByLabelText("输入消息"), "报销流程是什么{enter}");

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/dingtalk/browser-identity",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            authCode: "auth-code-1",
            source: "oauth2",
          }),
        }),
      );
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/dingtalk/webhook/stream",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining(
          '"senderStaffId":"0215084121561138029"',
        ),
      }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/dingtalk/webhook/stream",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining(
          '"senderSource":"oauth2-redirect"',
        ),
      }),
    );
  });

  it("opens an image preview dialog when a cited image is clicked", async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          reply: "报销流程如下，详见{{图1}}。",
          kind: "knowledge",
          images: [
            {
              name: "图1",
              data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yf9cAAAAASUVORK5CYII=",
              preview: "报销流程示意图",
            },
          ],
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
    await user.type(screen.getByLabelText("输入消息"), "报销流程是什么{enter}");

    await screen.findByRole("img", {
      name: "报销流程示意图",
    });
    expect(screen.queryByText(/\{\{图1\}\}/)).not.toBeInTheDocument();

    const thumbnails = await screen.findAllByRole("img", {
      name: "报销流程示意图",
    });
    expect(thumbnails).toHaveLength(1);

    await user.click(thumbnails[0]!);

    expect(screen.getByRole("dialog", { name: "图1 预览" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭预览" })).toBeInTheDocument();
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
