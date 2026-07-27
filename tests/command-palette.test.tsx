import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommandPalette } from "../src/search/CommandPalette";

const drawing = { path: "Architecture/auth-flow.excalidraw", title: "auth-flow", modifiedAt: 0, tags: [] };

describe("CommandPalette", () => {
  it("filters drawings and opens the highlighted result with Enter", () => {
    const onOpenDrawing = vi.fn();
    const onClose = vi.fn();
    render(
      <CommandPalette
        drawings={[drawing]}
        folders={[]}
        onOpenDrawing={onOpenDrawing}
        onOpenFolder={vi.fn()}
        onNewDrawing={vi.fn()}
        onNewFolder={vi.fn()}
        onImportDrawing={vi.fn()}
        onClose={onClose}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Search commands" });
    fireEvent.change(input, { target: { value: "auth" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onOpenDrawing).toHaveBeenCalledWith(drawing);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
