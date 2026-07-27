use crate::{
    fs::library::{self, CommandResult, DrawingSummary, FolderSummary, LibraryState},
    index::{self, IndexStats},
};
use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub fn get_library_state(app: AppHandle) -> CommandResult<LibraryState> {
    let state = library::get_library_state(&app)?;
    if let Ok(root) = library::active_library_root(&app) {
        // A broken cache must never prevent library browsing. Search reports an
        // actionable error if it cannot rebuild its derived index later.
        let _ = index::rebuild(&root);
    }
    Ok(state)
}

#[tauri::command]
pub async fn choose_library_root(app: AppHandle) -> CommandResult<LibraryState> {
    let selected = app
        .dialog()
        .file()
        .set_title("Choose a LocalCanvas library folder")
        .blocking_pick_folder();

    let Some(selected) = selected else {
        return get_library_state(app);
    };

    let path: PathBuf = selected
        .into_path()
        .map_err(|error| format!("Couldn't use the selected folder: {error}"))?;
    let state = library::set_library_root(&app, path)?;
    if let Ok(root) = library::active_library_root(&app) {
        let _ = index::rebuild(&root);
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
