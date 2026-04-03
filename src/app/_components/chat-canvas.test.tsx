import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChatCanvas } from "./chat-canvas";

describe("ChatCanvas", () => {
  it("renders an inline image placeholder while image data is still unavailable", () => {
    render(
      <ChatCanvas
        isSending={false}
        messages={[
          {
            id: "assistant-1",
            role: "assistant",
            content: "报销流程如下，详见{{图1}}。",
            kind: "knowledge",
          },
        ]}
      />,
    );

    expect(screen.getByText("图片加载中")).toBeInTheDocument();
    expect(screen.getByText("图1")).toBeInTheDocument();
    expect(screen.queryByText(/\{\{图1\}\}/)).not.toBeInTheDocument();
  });
});
