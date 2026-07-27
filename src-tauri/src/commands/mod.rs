use crate::fs::library::{self, CommandResult, DrawingSummary, FolderSummary, LibraryState};
use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub fn get_library_state(app: AppHandle) -> CommandResult<LibraryState> {
    library::get_library_state(&app)
}

#[tauri::command]
pub async fn choose_library_root(app: AppHandle) -> CommandResult<LibraryState> {
    let selected = app
        .dialog()
        .file()
        .set_title("Choose a LocalCanvas library folder")
        .blocking_pick_folder();

    let Some(selected) = selected else {
        return library::get_library_state(&app);
    };

    let path: PathBuf = selected
        .into_path()
        .map_err(|error| format!("Couldn't use the selected folder: {error}"))?;
    library::set_library_root(&app, path)
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
