use crate::{
    fs::library::{self, CommandResult, DrawingSummary, FolderSummary, LibraryState},
    index::{self, IndexStats},
};
use std::path::PathBuf;
use tauri::{AppHandle, State};

use crate::watcher::{self, LibraryWatcher};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub fn get_library_state(
    app: AppHandle,
    watcher: State<LibraryWatcher>,
) -> CommandResult<LibraryState> {
    let state = library::get_library_state(&app)?;
    if let Ok(root) = library::active_library_root(&app) {
        let _ = watcher::watch_library(&app, &watcher, &root);
        // A broken cache must never prevent library browsing. Search reports an
        // actionable error if it cannot rebuild its derived index later.
        let _ = index::rebuild(&root);
    }
    Ok(state)
}

#[tauri::command]
pub async fn choose_library_root(
    app: AppHandle,
    watcher: State<'_, LibraryWatcher>,
) -> CommandResult<LibraryState> {
    let selected = app
        .dialog()
        .file()
        .set_title("Choose a LocalCanvas library folder")
        .blocking_pick_folder();

    let Some(selected) = selected else {
        return get_library_state(app, watcher);
    };

    let path: PathBuf = selected
        .into_path()
        .map_err(|error| format!("Couldn't use the selected folder: {error}"))?;
    let state = library::set_library_root(&app, path)?;
    if let Ok(root) = library::active_library_root(&app) {
        let _ = index::rebuild(&root);
        let _ = watcher::watch_library(&app, &watcher, &root);
    }
    Ok(state)
}

#[tauri::command]
pub fn rebuild_index(app: AppHandle) -> CommandResult<IndexStats> {
    index::rebuild(&library::active_library_root(&app)?)
}

#[tauri::command]
pub fn search_drawings(app: AppHandle, query: String) -> CommandResult<Vec<DrawingSummary>> {
    index::search(&library::active_library_root(&app)?, &query)
}

#[tauri::command]
pub fn read_scene(app: AppHandle, relative_path: String) -> CommandResult<String> {
    library::read_scene(&app, &relative_path)
}

#[tauri::command]
pub fn write_scene(app: AppHandle, relative_path: String, scene_json: String) -> CommandResult<()> {
    library::write_scene(&app, &relative_path, &scene_json)
}

#[tauri::command]
pub fn read_thumbnail(app: AppHandle, relative_path: String) -> CommandResult<Option<String>> {
    library::read_thumbnail(&app, &relative_path)
}

#[tauri::command]
pub fn write_thumbnail(
    app: AppHandle,
    relative_path: String,
    thumbnail_svg: String,
) -> CommandResult<()> {
    library::write_thumbnail(&app, &relative_path, &thumbnail_svg)
}

#[tauri::command]
pub async fn import_drawing(app: AppHandle, parent_path: String) -> CommandResult<DrawingSummary> {
    let selected = app
        .dialog()
        .file()
        .set_title("Import an Excalidraw drawing")
        .add_filter("Excalidraw drawings", &["excalidraw"])
        .blocking_pick_file();
    let Some(selected) = selected else {
        return Err("No drawing was selected.".to_owned());
    };
    let path: PathBuf = selected
        .into_path()
        .map_err(|error| format!("Couldn't use the selected drawing: {error}"))?;
    library::import_drawing(&app, &parent_path, &path)
}

#[tauri::command]
pub fn create_drawing(
    app: AppHandle,
    parent_path: String,
    title: String,
) -> CommandResult<DrawingSummary> {
    library::create_drawing(&app, &parent_path, &title)
}

#[tauri::command]
pub fn create_folder(
    app: AppHandle,
    parent_path: String,
    name: String,
) -> CommandResult<FolderSummary> {
    library::create_folder(&app, &parent_path, &name)
}

#[tauri::command]
pub fn delete_drawing(app: AppHandle, relative_path: String) -> CommandResult<()> {
    library::delete_drawing(&app, &relative_path)
}

#[tauri::command]
pub fn delete_folder(app: AppHandle, relative_path: String) -> CommandResult<()> {
    library::delete_folder(&app, &relative_path)
}

#[tauri::command]
pub fn rename_drawing(
    app: AppHandle,
    relative_path: String,
    title: String,
) -> CommandResult<DrawingSummary> {
    library::rename_drawing(&app, &relative_path, &title)
}

#[tauri::command]
pub fn rename_folder(
    app: AppHandle,
    relative_path: String,
    name: String,
) -> CommandResult<FolderSummary> {
    library::rename_folder(&app, &relative_path, &name)
}

#[tauri::command]
pub fn move_drawing(
    app: AppHandle,
    relative_path: String,
    parent_path: String,
) -> CommandResult<DrawingSummary> {
    library::move_drawing(&app, &relative_path, &parent_path)
}

#[tauri::command]
pub fn move_folder(
    app: AppHandle,
    relative_path: String,
    parent_path: String,
) -> CommandResult<FolderSummary> {
    library::move_folder(&app, &relative_path, &parent_path)
}
