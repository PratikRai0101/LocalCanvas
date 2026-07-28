use crate::{
    fs::library::{self, CommandResult, DrawingSummary, FolderSummary, LibraryState},
    index::{self, GraphData, IndexStats},
};
use serde::Serialize;
use std::{fs, path::PathBuf};
use tauri::{AppHandle, State};

use crate::watcher::{self, LibraryWatcher};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedScene {
    pub file_name: String,
    pub mime_type: String,
    pub contents: Vec<u8>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DroppedImage {
    pub file_name: String,
    pub mime_type: String,
    pub contents: Vec<u8>,
}

const MAX_DROPPED_IMAGE_BYTES: u64 = 25 * 1024 * 1024;

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
pub fn resolve_drawing_id(
    app: AppHandle,
    drawing_id: String,
) -> CommandResult<Option<DrawingSummary>> {
    index::resolve_drawing_id(&library::active_library_root(&app)?, &drawing_id)
}

#[tauri::command]
pub fn get_graph(app: AppHandle) -> CommandResult<GraphData> {
    index::graph(&library::active_library_root(&app)?)
}

#[tauri::command]
pub fn get_backlinks(app: AppHandle, relative_path: String) -> CommandResult<Vec<DrawingSummary>> {
    index::backlinks(&library::active_library_root(&app)?, &relative_path)
}

#[tauri::command]
pub fn record_drawing_opened(app: AppHandle, relative_path: String) -> CommandResult<()> {
    library::record_drawing_opened(&app, &relative_path)
}

#[tauri::command]
pub fn set_drawing_pinned(
    app: AppHandle,
    relative_path: String,
    pinned: bool,
) -> CommandResult<()> {
    library::set_drawing_pinned(&app, &relative_path, pinned)
}

#[tauri::command]
pub fn set_history_enabled(app: AppHandle, enabled: bool) -> CommandResult<()> {
    library::set_history_enabled(&app, enabled)
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
pub fn list_scene_versions(
    app: AppHandle,
    relative_path: String,
) -> CommandResult<Vec<library::VersionSummary>> {
    library::list_scene_versions(&app, &relative_path)
}

#[tauri::command]
pub fn read_scene_version(
    app: AppHandle,
    relative_path: String,
    version_id: String,
) -> CommandResult<String> {
    library::read_scene_version(&app, &relative_path, &version_id)
}

#[tauri::command]
pub fn restore_scene_version(
    app: AppHandle,
    relative_path: String,
    version_id: String,
) -> CommandResult<()> {
    library::restore_scene_version(&app, &relative_path, &version_id)
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
pub fn write_voice_note(
    app: AppHandle,
    relative_path: String,
    note_id: String,
    contents: Vec<u8>,
) -> CommandResult<()> {
    library::write_voice_note(&app, &relative_path, &note_id, &contents)
}

#[tauri::command]
pub fn read_voice_note(
    app: AppHandle,
    relative_path: String,
    note_id: String,
) -> CommandResult<Vec<u8>> {
    library::read_voice_note(&app, &relative_path, &note_id)
}

#[tauri::command]
pub fn delete_voice_note(app: AppHandle, relative_path: String, note_id: String) -> CommandResult<()> {
    library::delete_voice_note(&app, &relative_path, &note_id)
}

#[tauri::command]
pub fn read_dropped_image(path: String) -> CommandResult<DroppedImage> {
    let path = PathBuf::from(path);
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    let mime_type = match extension.to_ascii_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => return Err("Unsupported image format.".to_owned()),
    };
    let metadata = fs::metadata(&path)
        .map_err(|error| format!("Couldn't inspect the dropped image: {error}"))?;
    if !metadata.is_file() {
        return Err("The dropped item isn't a file.".to_owned());
    }
    if metadata.len() > MAX_DROPPED_IMAGE_BYTES {
        return Err("Images larger than 25 MB can't be added to a canvas.".to_owned());
    }
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("image")
        .to_owned();
    let contents =
        fs::read(path).map_err(|error| format!("Couldn't read the dropped image: {error}"))?;
    Ok(DroppedImage {
        file_name,
        mime_type: mime_type.to_owned(),
        contents,
    })
}

#[tauri::command]
pub fn recognize_image_text(image_bytes: Vec<u8>) -> CommandResult<String> {
    crate::ocr::recognize_image_text(&image_bytes)
}

#[tauri::command]
pub fn pick_import_scene(app: AppHandle) -> CommandResult<ImportedScene> {
    let selected = app
        .dialog()
        .file()
        .set_title("Import an Excalidraw drawing")
        .add_filter("Excalidraw drawings", &["excalidraw", "png", "svg"])
        .blocking_pick_file();
    let Some(selected) = selected else {
        return Err("No drawing was selected.".to_owned());
    };
    let path: PathBuf = selected
        .into_path()
        .map_err(|error| format!("Couldn't use the selected drawing: {error}"))?;
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    let mime_type = match extension.to_ascii_lowercase().as_str() {
        "excalidraw" => "application/json",
        "png" => "image/png",
        "svg" => "image/svg+xml",
        _ => return Err("Unsupported import format.".to_owned()),
    };
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Imported drawing")
        .to_owned();
    let contents =
        fs::read(path).map_err(|error| format!("Couldn't read the selected drawing: {error}"))?;
    Ok(ImportedScene {
        file_name,
        mime_type: mime_type.to_owned(),
        contents,
    })
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
pub fn get_drawing_tags(app: AppHandle, relative_path: String) -> CommandResult<Vec<String>> {
    library::drawing_tags(&app, &relative_path)
}

#[tauri::command]
pub fn set_drawing_tags(
    app: AppHandle,
    relative_path: String,
    tags: Vec<String>,
) -> CommandResult<()> {
    library::set_drawing_tags(&app, &relative_path, tags)
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
