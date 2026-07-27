import { invoke } from "@tauri-apps/api/core";

export type DrawingSummary = {
  path: string;
  title: string;
  modifiedAt: number;
  tags: string[];
};

export type FolderSummary = {
  path: string;
  name: string;
};

export type LibraryState = {
  root: string | null;
  drawings: DrawingSummary[];
  folders: FolderSummary[];
  recentPaths: string[];
  pinnedPaths: string[];
};

export type ImportedScene = {
  fileName: string;
  mimeType: string;
  contents: number[];
};

export type DroppedImage = {
  fileName: string;
  mimeType: string;
  contents: number[];
};

export type GraphData = {
  nodes: Array<{ id: string; path: string; title: string }>;
  edges: Array<{ sourceId: string; targetId: string }>;
};

export const libraryApi = {
  getState: () => invoke<LibraryState>("get_library_state"),
  chooseRoot: () => invoke<LibraryState>("choose_library_root"),
  searchDrawings: (query: string) =>
    invoke<DrawingSummary[]>("search_drawings", { query }),
  getBacklinks: (relativePath: string) =>
    invoke<DrawingSummary[]>("get_backlinks", { relativePath }),
  getGraph: () => invoke<GraphData>("get_graph"),
  resolveDrawingId: (drawingId: string) =>
    invoke<DrawingSummary | null>("resolve_drawing_id", { drawingId }),
  recordDrawingOpened: (relativePath: string) =>
    invoke<void>("record_drawing_opened", { relativePath }),
  setDrawingPinned: (relativePath: string, pinned: boolean) =>
    invoke<void>("set_drawing_pinned", { relativePath, pinned }),
  readScene: (relativePath: string) =>
    invoke<string>("read_scene", { relativePath }),
  writeScene: (relativePath: string, sceneJson: string) =>
    invoke<void>("write_scene", { relativePath, sceneJson }),
  readThumbnail: (relativePath: string) =>
    invoke<string | null>("read_thumbnail", { relativePath }),
  writeThumbnail: (relativePath: string, thumbnailSvg: string) =>
    invoke<void>("write_thumbnail", { relativePath, thumbnailSvg }),
  readDroppedImage: (path: string) => invoke<DroppedImage>("read_dropped_image", { path }),
  pickImportScene: () => invoke<ImportedScene>("pick_import_scene"),
  createDrawing: (parentPath: string, title: string) =>
    invoke<DrawingSummary>("create_drawing", { parentPath, title }),
  createFolder: (parentPath: string, name: string) =>
    invoke<FolderSummary>("create_folder", { parentPath, name }),
  getDrawingTags: (relativePath: string) =>
    invoke<string[]>("get_drawing_tags", { relativePath }),
  setDrawingTags: (relativePath: string, tags: string[]) =>
    invoke<void>("set_drawing_tags", { relativePath, tags }),
  deleteDrawing: (relativePath: string) =>
    invoke<void>("delete_drawing", { relativePath }),
  deleteFolder: (relativePath: string) =>
    invoke<void>("delete_folder", { relativePath }),
  renameDrawing: (relativePath: string, title: string) =>
    invoke<DrawingSummary>("rename_drawing", { relativePath, title }),
  renameFolder: (relativePath: string, name: string) =>
    invoke<FolderSummary>("rename_folder", { relativePath, name }),
  moveDrawing: (relativePath: string, parentPath: string) =>
    invoke<DrawingSummary>("move_drawing", { relativePath, parentPath }),
  moveFolder: (relativePath: string, parentPath: string) =>
    invoke<FolderSummary>("move_folder", { relativePath, parentPath }),
};
