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
  importDrawing: vi.fn(),
  createDrawing: vi.fn(),
  createFolder: vi.fn(),
  deleteDrawing: vi.fn(),
  deleteFolder: vi.fn(),
  renameDrawing: vi.fn(),
  renameFolder: vi.fn(),
  moveDrawing: vi.fn(),
  moveFolder: vi.fn(),
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
    libraryApi.importDrawing.mockReset();
    libraryApi.deleteDrawing.mockReset();
    libraryApi.deleteFolder.mockReset();
    libraryApi.renameDrawing.mockReset();
    libraryApi.renameFolder.mockReset();
    libraryApi.moveDrawing.mockReset();
    libraryApi.moveFolder.mockReset();
    libraryApi.getState.mockResolvedValue(library);
  });

  it("keeps Canvas's post-save callback stable when an autosave completes", async () => {
    render(<App />);

    fireEvent.click(await screen.findByTitle("test.excalidraw"));
    await screen.findByRole("button", { name: "Simulate completed autosave" });
    expect(canvasProps).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Simulate completed autosave" }));

    await waitFor(() => expect(libraryApi.getState).toHaveBeenCalledTimes(2));
    expect(canvasProps).toHaveLength(1);
  });

  it("imports an existing Excalidraw file into the selected library folder", async () => {
    libraryApi.importDrawing.mockResolvedValue(drawing);
    render(<App />);

    fireEvent.click((await screen.findAllByRole("button", { name: "Import existing Excalidraw drawing" })).at(-1)!);

    await waitFor(() => expect(libraryApi.importDrawing).toHaveBeenCalledWith(""));
  });

  it("renames a drawing from its app context menu", async () => {
    libraryApi.renameDrawing.mockResolvedValue({ ...drawing, path: "renamed.excalidraw", title: "renamed" });
    render(<App />);

    fireEvent.contextMenu((await screen.findAllByTitle("test.excalidraw")).at(-1)!);
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename…" }));
    fireEvent.change(screen.getByLabelText("Drawing name"), { target: { value: "renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));

    await waitFor(() => expect(libraryApi.renameDrawing).toHaveBeenCalledWith("test.excalidraw", "renamed"));
  });

  it("offers a destructive action instead of the WebView context menu", async () => {
    libraryApi.deleteDrawing.mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);

    fireEvent.contextMenu((await screen.findAllByTitle("test.excalidraw")).at(-1)!);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete drawing" }));

    await waitFor(() => expect(libraryApi.deleteDrawing).toHaveBeenCalledWith("test.excalidraw"));
  });
});
