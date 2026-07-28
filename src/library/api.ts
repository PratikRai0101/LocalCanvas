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
  historyEnabled: boolean;
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

export type SceneVersion = {
  id: string;
  createdAt: number;
  byteLength: number;
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
  setHistoryEnabled: (enabled: boolean) =>
    invoke<void>("set_history_enabled", { enabled }),
  readScene: (relativePath: string) =>
    invoke<string>("read_scene", { relativePath }),
  writeScene: (relativePath: string, sceneJson: string) =>
    invoke<void>("write_scene", { relativePath, sceneJson }),
  listSceneVersions: (relativePath: string) =>
    invoke<SceneVersion[]>("list_scene_versions", { relativePath }),
  readSceneVersion: (relativePath: string, versionId: string) =>
    invoke<string>("read_scene_version", { relativePath, versionId }),
  restoreSceneVersion: (relativePath: string, versionId: string) =>
    invoke<void>("restore_scene_version", { relativePath, versionId }),
  readThumbnail: (relativePath: string) =>
    invoke<string | null>("read_thumbnail", { relativePath }),
  writeThumbnail: (relativePath: string, thumbnailSvg: string) =>
    invoke<void>("write_thumbnail", { relativePath, thumbnailSvg }),
  writeVoiceNote: (relativePath: string, noteId: string, contents: number[]) =>
    invoke<void>("write_voice_note", { relativePath, noteId, contents }),
  readVoiceNote: (relativePath: string, noteId: string) =>
    invoke<number[]>("read_voice_note", { relativePath, noteId }),
  deleteVoiceNote: (relativePath: string, noteId: string) =>
    invoke<void>("delete_voice_note", { relativePath, noteId }),
  readDroppedImage: (path: string) => invoke<DroppedImage>("read_dropped_image", { path }),
  recognizeImageText: (imageBytes: number[]) =>
    invoke<string>("recognize_image_text", { imageBytes }),
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
