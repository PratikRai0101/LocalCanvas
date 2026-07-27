import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "../src/search/CommandPalette";

const drawing = {
  path: "Architecture/Authentication Map.excalidraw",
  title: "Authentication Map",
  modifiedAt: 0,
  tags: ["work"],
};

function renderPalette() {
  const handlers = {
    onOpenDrawing: vi.fn(),
    onOpenFolder: vi.fn(),
    onNewDrawing: vi.fn(),
    onNewFolder: vi.fn(),
    onImportDrawing: vi.fn(),
    onOpenTag: vi.fn(),
    onOpenGraph: vi.fn(),
    onCloseGraph: vi.fn(),
    onShowAllDrawings: vi.fn(),
    onClose: vi.fn(),
  };
  render(
    <CommandPalette
      drawings={[drawing]}
      folders={[{ path: "Architecture", name: "Architecture" }]}
      tags={["work"]}
      isGraphOpen={false}
      {...handlers}
    />,
  );
  return handlers;
}

afterEach(cleanup);

describe("CommandPalette", () => {
  it("fuzzy-matches a drawing title", () => {
    renderPalette();

    fireEvent.change(screen.getByRole("textbox", { name: "Search commands" }), { target: { value: "atm" } });

    expect(screen.getByRole("option", { name: /Authentication Map/i })).toBeTruthy();
  });

  it("runs graph navigation from the keyboard", () => {
    const handlers = renderPalette();
    const input = screen.getByRole("textbox", { name: "Search commands" });

    fireEvent.change(input, { target: { value: "graph" } });
    expect(screen.getByRole("option", { name: /Open graph/i })).toBeTruthy();
    fireEvent.keyDown(input, { key: "Enter" });

    expect(handlers.onOpenGraph).toHaveBeenCalledOnce();
    expect(handlers.onClose).toHaveBeenCalledOnce();
  });
});
