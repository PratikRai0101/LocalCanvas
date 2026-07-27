import { invoke } from "@tauri-apps/api/core";

export type DrawingSummary = {
  path: string;
  title: string;
  modifiedAt: number;
};

export type FolderSummary = {
  path: string;
  name: string;
};

export type LibraryState = {
  root: string | null;
  drawings: DrawingSummary[];
  folders: FolderSummary[];
};

export const libraryApi = {
  getState: () => invoke<LibraryState>("get_library_state"),
  chooseRoot: () => invoke<LibraryState>("choose_library_root"),
  searchDrawings: (query: string) =>
    invoke<DrawingSummary[]>("search_drawings", { query }),
  readScene: (relativePath: string) =>
    invoke<string>("read_scene", { relativePath }),
  writeScene: (relativePath: string, sceneJson: string) =>
    invoke<void>("write_scene", { relativePath, sceneJson }),
  readThumbnail: (relativePath: string) =>
    invoke<string | null>("read_thumbnail", { relativePath }),
  writeThumbnail: (relativePath: string, thumbnailSvg: string) =>
    invoke<void>("write_thumbnail", { relativePath, thumbnailSvg }),
  importDrawing: (parentPath: string) =>
    invoke<DrawingSummary>("import_drawing", { parentPath }),
  createDrawing: (parentPath: string, title: string) =>
    invoke<DrawingSummary>("create_drawing", { parentPath, title }),
  createFolder: (parentPath: string, name: string) =>
    invoke<FolderSummary>("create_folder", { parentPath, name }),
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
