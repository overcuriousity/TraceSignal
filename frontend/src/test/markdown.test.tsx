/**
 * Markdown — agent output rendering (ROADMAP A5): GFM markdown becomes real
 * elements, raw HTML stays inert text (agent output is untrusted).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Markdown } from "@/components/agent/Markdown";

describe("Markdown", () => {
  it("renders headings, emphasis, lists and inline code", () => {
    render(
      <Markdown
        content={"## Findings\n\nSaw **3 spikes** in `auth.log`:\n\n- one\n- two"}
      />,
    );
    expect(screen.getByRole("heading", { name: "Findings" })).toBeTruthy();
    expect(screen.getByText("3 spikes").tagName).toBe("STRONG");
    expect(screen.getByText("auth.log").tagName).toBe("CODE");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("renders GFM tables and fenced code blocks", () => {
    render(
      <Markdown
        content={"| field | count |\n|---|---|\n| src_ip | 42 |\n\n```\nSELECT 1\n```"}
      />,
    );
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByText("SELECT 1").closest("pre")).toBeTruthy();
  });

  it("does not render raw HTML from the model", () => {
    const { container } = render(
      <Markdown content={'before <img src=x onerror="x()"> after'} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img");
  });

  it("opens links in a new tab without opener access", () => {
    render(<Markdown content={"[docs](https://example.com)"} />);
    const link = screen.getByRole("link", { name: "docs" });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });
});
