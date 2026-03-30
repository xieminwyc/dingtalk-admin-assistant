import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Home", () => {
  it("renders the portal shell instead of the debug workbench", () => {
    render(<Home />);

    expect(screen.getByText("万事通")).toBeInTheDocument();
    expect(screen.getByText("找制度")).toBeInTheDocument();
  });
});
