import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Home", () => {
  it("renders a backend-only debug page instead of a workbench app shell", () => {
    render(<Home />);

    expect(screen.getByText("钉钉机器人后端已启动")).toBeInTheDocument();
    expect(
      screen.getByText("当前项目只保留机器人与 Stream Mode 调试能力。")
    ).toBeInTheDocument();
  });
});
