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
  createDrawing: (parentPath: string, title: string) =>
    invoke<DrawingSummary>("create_drawing", { parentPath, title }),
  createFolder: (parentPath: string, name: string) =>
    invoke<FolderSummary>("create_folder", { parentPath, name }),
};
