import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SaveStatus } from "../src/canvas/Canvas";
import type { DrawingSummary, LibraryState } from "../src/library/api";

const canvasProps = vi.hoisted(() => [] as Array<{
  onSaveStatus: (status: SaveStatus) => void;
  onSaved: () => void;
}>);

const libraryApi = vi.hoisted(() => ({
  getState: vi.fn(),
  chooseRoot: vi.fn(),
  searchDrawings: vi.fn(),
  readScene: vi.fn(),
  writeScene: vi.fn(),
  createDrawing: vi.fn(),
  createFolder: vi.fn(),
}));

vi.mock("../src/canvas/Canvas", () => ({
  Canvas: ({
    onSaveStatus,
    onSaved,
  }: {
    onSaveStatus: (status: SaveStatus) => void;
    onSaved: () => void;
  }) => {
    canvasProps.push({ onSaveStatus, onSaved });
    return (
      <button
        type="button"
        onClick={() => {
          onSaveStatus("saving");
          onSaved();
        }}
      >
        Simulate completed autosave
      </button>
    );
  },
}));

vi.mock("../src/library/api", () => ({ libraryApi }));
vi.mock("../src/library/ThumbnailGrid", () => ({
  ThumbnailGrid: () => <div />,
}));

import App from "../src/App";

const drawing: DrawingSummary = {
  path: "test.excalidraw",
  title: "test",
  modifiedAt: 0,
};

const library: LibraryState = {
  root: "/tmp/localcanvas-test",
  drawings: [drawing],
  folders: [],
};

describe("App autosave wiring", () => {
  beforeEach(() => {
    canvasProps.length = 0;
    libraryApi.getState.mockReset();
    libraryApi.getState.mockResolvedValue(library);
  });

  it("keeps Canvas's post-save callback stable when save status changes", async () => {
    render(<App />);

    fireEvent.click(await screen.findByTitle("test.excalidraw"));
    await screen.findByRole("button", { name: "Simulate completed autosave" });
    expect(canvasProps).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Simulate completed autosave" }));

    await waitFor(() => expect(canvasProps).toHaveLength(2));
    expect(canvasProps[1].onSaved).toBe(canvasProps[0].onSaved);
  });
});
