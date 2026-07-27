use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs::{self, OpenOptions},
    io::Write,
    path::{Component, Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};
use uuid::Uuid;
use walkdir::{DirEntry, WalkDir};

const LOCALCANVAS_DIR: &str = ".localcanvas";
const SETTINGS_FILE: &str = "settings.json";
const THUMBNAIL_DIR: &str = "thumbnails";
const VERSION_DIR: &str = "versions";
const MAX_VERSION_SNAPSHOTS: usize = 50;
const FINDER_TAG_ATTRIBUTE: &str = "com.apple.metadata:_kMDItemUserTags";

pub type CommandResult<T> = Result<T, String>;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DrawingSummary {
    pub path: String,
    pub title: String,
    pub modified_at: u128,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderSummary {
    pub path: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionSummary {
    pub id: String,
    pub created_at: u128,
    pub byte_length: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryState {
    pub root: Option<String>,
    pub drawings: Vec<DrawingSummary>,
    pub folders: Vec<FolderSummary>,
    pub recent_paths: Vec<String>,
    pub pinned_paths: Vec<String>,
    pub history_enabled: bool,
}

fn history_enabled_by_default() -> bool {
    true
}

#[derive(Debug, Deserialize, Serialize)]
struct LibraryPreferences {
    #[serde(default)]
    recent_paths: Vec<String>,
    #[serde(default)]
    pinned_paths: Vec<String>,
    #[serde(default = "history_enabled_by_default")]
    history_enabled: bool,
}

impl Default for LibraryPreferences {
    fn default() -> Self {
        Self {
            recent_paths: Vec::new(),
            pinned_paths: Vec::new(),
            history_enabled: true,
        }
    }
}

#[derive(Debug, Deserialize, Serialize, Default)]
struct Settings {
    library_root: Option<PathBuf>,
    #[serde(default)]
    preferences: HashMap<String, LibraryPreferences>,
}

pub fn get_library_state(app: &AppHandle) -> CommandResult<LibraryState> {
    match load_library_root(app)? {
        Some(root) if root.is_dir() => with_preferences(app, list_library(root)?),
        Some(root) => Ok(LibraryState {
            root: Some(path_to_string(&root)),
            drawings: Vec::new(),
            folders: Vec::new(),
            recent_paths: Vec::new(),
            pinned_paths: Vec::new(),
            history_enabled: true,
        }),
        None => Ok(LibraryState {
            root: None,
            drawings: Vec::new(),
            folders: Vec::new(),
            recent_paths: Vec::new(),
            pinned_paths: Vec::new(),
            history_enabled: true,
        }),
    }
}

pub fn set_library_root(app: &AppHandle, root: PathBuf) -> CommandResult<LibraryState> {
    let root = root
        .canonicalize()
        .map_err(|error| format!("Couldn't open the selected folder: {error}"))?;

    if !root.is_dir() {
        return Err("The selected location is not a folder.".to_owned());
    }

    // This directory only contains rebuildable cache data. Drawing files remain
    // directly in the user-selected root and are always authoritative.
    fs::create_dir_all(root.join(LOCALCANVAS_DIR))
        .map_err(|error| format!("Couldn't prepare LocalCanvas cache: {error}"))?;

    let mut settings = load_settings(app)?;
    settings.library_root = Some(root.clone());
    save_settings(app, &settings)?;

    with_preferences(app, list_library(root)?)
}

pub fn record_drawing_opened(app: &AppHandle, relative_path: &str) -> CommandResult<()> {
    let root = active_library_root(app)?;
    resolve_existing_drawing_path(&root, relative_path)?;
    let mut settings = load_settings(app)?;
    let preferences = settings
        .preferences
        .entry(path_to_string(&root))
        .or_default();
    preferences
        .recent_paths
        .retain(|path| path != relative_path);
    preferences.recent_paths.insert(0, relative_path.to_owned());
    preferences.recent_paths.truncate(10);
    save_settings(app, &settings)
}

pub fn set_drawing_pinned(app: &AppHandle, relative_path: &str, pinned: bool) -> CommandResult<()> {
    let root = active_library_root(app)?;
    resolve_existing_drawing_path(&root, relative_path)?;
    let mut settings = load_settings(app)?;
    let preferences = settings
        .preferences
        .entry(path_to_string(&root))
        .or_default();
    preferences
        .pinned_paths
        .retain(|path| path != relative_path);
    if pinned {
        preferences.pinned_paths.push(relative_path.to_owned());
    }
    save_settings(app, &settings)
}

pub fn set_history_enabled(app: &AppHandle, enabled: bool) -> CommandResult<()> {
    let root = active_library_root(app)?;
    let mut settings = load_settings(app)?;
    settings
        .preferences
        .entry(path_to_string(&root))
        .or_default()
        .history_enabled = enabled;
    save_settings(app, &settings)
}

pub fn read_scene(app: &AppHandle, relative_path: &str) -> CommandResult<String> {
    let root = active_library_root(app)?;
    let path = resolve_existing_drawing_path(&root, relative_path)?;

    fs::read_to_string(&path).map_err(|error| format!("Couldn't read drawing: {error}"))
}

pub fn write_scene(app: &AppHandle, relative_path: &str, scene_json: &str) -> CommandResult<()> {
    let root = active_library_root(app)?;
    let history_enabled = load_settings(app)?
        .preferences
        .get(&path_to_string(&root))
        .map(|preferences| preferences.history_enabled)
        .unwrap_or(true);
    write_scene_at(&root, relative_path, scene_json, history_enabled)
}

pub fn list_scene_versions(
    app: &AppHandle,
    relative_path: &str,
) -> CommandResult<Vec<VersionSummary>> {
    let root = active_library_root(app)?;
    list_versions_at(&root, relative_path)
}

pub fn read_scene_version(
    app: &AppHandle,
    relative_path: &str,
    version_id: &str,
) -> CommandResult<String> {
    let root = active_library_root(app)?;
    read_version_at(&root, relative_path, version_id)
}

pub fn restore_scene_version(
    app: &AppHandle,
    relative_path: &str,
    version_id: &str,
) -> CommandResult<()> {
    let root = active_library_root(app)?;
    restore_version_at(&root, relative_path, version_id)
}

fn write_scene_at(
    root: &Path,
    relative_path: &str,
    scene_json: &str,
    history_enabled: bool,
) -> CommandResult<()> {
    let path = resolve_existing_drawing_path(root, relative_path)?;
    validate_excalidraw_scene(scene_json)?;
    let existing_scene =
        fs::read(&path).map_err(|error| format!("Couldn't read drawing before saving: {error}"))?;
    if existing_scene != scene_json.as_bytes() {
        // Excalidraw emits changes for viewport, selection, and other UI-only
        // appState. Persist those changes, but do not turn them into recovery
        // points: a history entry should represent a changed canvas.
        if history_enabled && scene_contents_changed(&existing_scene, scene_json.as_bytes()) {
            snapshot_scene(root, relative_path, &existing_scene)?;
        }
        atomic_write(&path, scene_json.as_bytes())?;
        invalidate_thumbnail(root, relative_path);
    }
    Ok(())
}

fn scene_contents_changed(existing_scene: &[u8], next_scene: &[u8]) -> bool {
    fn content(scene: &[u8]) -> Option<Value> {
        let scene = serde_json::from_slice::<Value>(scene).ok()?;
        Some(json!({
            "elements": scene.get("elements")?,
            "files": scene.get("files")?,
        }))
    }

    match (content(existing_scene), content(next_scene)) {
        (Some(existing), Some(next)) => existing != next,
        // Validation makes this fallback unlikely, but never suppress a
        // recovery point when an older scene cannot be interpreted.
        _ => existing_scene != next_scene,
    }
}

fn list_versions_at(root: &Path, relative_path: &str) -> CommandResult<Vec<VersionSummary>> {
    let path = resolve_existing_drawing_path(root, relative_path)?;
    let scene =
        fs::read(&path).map_err(|error| format!("Couldn't read drawing versions: {error}"))?;
    let mut versions = Vec::new();

    for directory in version_directories(root, relative_path, &scene) {
        let entries = match fs::read_dir(directory) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(format!("Couldn't read drawing versions: {error}")),
        };
        for entry in entries {
            let entry = entry.map_err(|error| format!("Couldn't read drawing version: {error}"))?;
            let path = entry.path();
            let Some(id) = version_id_from_path(&path) else {
                continue;
            };
            let metadata = entry
                .metadata()
                .map_err(|error| format!("Couldn't inspect drawing version: {error}"))?;
            versions.push(VersionSummary {
                created_at: version_timestamp(&id).unwrap_or_else(|| {
                    metadata
                        .modified()
                        .unwrap_or(SystemTime::UNIX_EPOCH)
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis()
                }),
                id,
                byte_length: metadata.len(),
            });
        }
    }

    versions.sort_by(|left, right| {
        right
            .created_at
            .cmp(&left.created_at)
            .then_with(|| right.id.cmp(&left.id))
    });
    versions.dedup_by(|left, right| left.id == right.id);
    Ok(versions)
}

fn read_version_at(root: &Path, relative_path: &str, version_id: &str) -> CommandResult<String> {
    let path = version_path(root, relative_path, version_id)?;
    fs::read_to_string(path).map_err(|error| format!("Couldn't read drawing version: {error}"))
}

fn restore_version_at(root: &Path, relative_path: &str, version_id: &str) -> CommandResult<()> {
    let scene_json = read_version_at(root, relative_path, version_id)?;
    // A restore must retain the current canvas, even if history was disabled
    // after this version was created.
    write_scene_at(root, relative_path, &scene_json, true)
}

fn snapshot_scene(root: &Path, relative_path: &str, scene: &[u8]) -> CommandResult<()> {
    let directory = version_directories(root, relative_path, scene)
        .into_iter()
        .next()
        .expect("a drawing always has a version directory");
    let id = format!("{}-{}", now_millis(), Uuid::new_v4());
    atomic_write(&directory.join(format!("{id}.excalidraw")), scene)?;
    prune_versions(&directory)
}

fn version_path(root: &Path, relative_path: &str, version_id: &str) -> CommandResult<PathBuf> {
    if !is_valid_version_id(version_id) {
        return Err("Invalid drawing version identifier.".to_owned());
    }
    let drawing_path = resolve_existing_drawing_path(root, relative_path)?;
    let scene = fs::read(&drawing_path)
        .map_err(|error| format!("Couldn't read drawing versions: {error}"))?;
    for directory in version_directories(root, relative_path, &scene) {
        let candidate = directory.join(format!("{version_id}.excalidraw"));
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    Err("The requested drawing version no longer exists.".to_owned())
}

fn version_directories(root: &Path, relative_path: &str, scene: &[u8]) -> Vec<PathBuf> {
    let mut keys = vec![format!("path-{}", sha256_hex(relative_path.as_bytes()))];
    if let Some(drawing_id) = drawing_id_from_scene(scene) {
        keys.insert(0, format!("drawing-{drawing_id}"));
    }
    keys.into_iter()
        .map(|key| root.join(LOCALCANVAS_DIR).join(VERSION_DIR).join(key))
        .collect()
}

fn drawing_id_from_scene(scene: &[u8]) -> Option<Uuid> {
    let scene = serde_json::from_slice::<Value>(scene).ok()?;
    scene
        .get("elements")?
        .as_array()?
        .iter()
        .find_map(|element| {
            let localcanvas = element.get("customData")?.get("localcanvas")?;
            (localcanvas.get("kind")?.as_str() == Some("drawing-metadata"))
                .then(|| localcanvas.get("drawingId")?.as_str())
                .flatten()
                .and_then(|id| Uuid::parse_str(id).ok())
        })
}

fn prune_versions(directory: &Path) -> CommandResult<()> {
    let mut versions = fs::read_dir(directory)
        .map_err(|error| format!("Couldn't read drawing versions: {error}"))?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            version_id_from_path(&path)
                .map(|id| (path, version_timestamp(&id).unwrap_or_default(), id))
        })
        .collect::<Vec<_>>();
    versions.sort_by(|left, right| right.1.cmp(&left.1).then_with(|| right.2.cmp(&left.2)));
    for (path, _, _) in versions.into_iter().skip(MAX_VERSION_SNAPSHOTS) {
        fs::remove_file(path)
            .map_err(|error| format!("Couldn't prune drawing version: {error}"))?;
    }
    Ok(())
}

fn version_id_from_path(path: &Path) -> Option<String> {
    let id = path.file_stem()?.to_str()?;
    is_valid_version_id(id).then(|| id.to_owned())
}

fn is_valid_version_id(id: &str) -> bool {
    let Some((timestamp, uuid)) = id.split_once('-') else {
        return false;
    };
    !timestamp.is_empty()
        && timestamp
            .chars()
            .all(|character| character.is_ascii_digit())
        && Uuid::parse_str(uuid).is_ok()
}

fn version_timestamp(id: &str) -> Option<u128> {
    id.split_once('-')?.0.parse().ok()
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

pub fn read_thumbnail(app: &AppHandle, relative_path: &str) -> CommandResult<Option<String>> {
    let root = active_library_root(app)?;
    let drawing_path = resolve_existing_drawing_path(&root, relative_path)?;
    let thumbnail_path = thumbnail_path(&root, relative_path);

    if !thumbnail_path.exists() {
        return Ok(None);
    }

    let drawing_modified = fs::metadata(&drawing_path)
        .and_then(|metadata| metadata.modified())
        .unwrap_or(SystemTime::UNIX_EPOCH);
    let thumbnail_modified = fs::metadata(&thumbnail_path)
        .and_then(|metadata| metadata.modified())
        .unwrap_or(SystemTime::UNIX_EPOCH);

    if thumbnail_modified < drawing_modified {
        let _ = fs::remove_file(&thumbnail_path);
        return Ok(None);
    }

    fs::read_to_string(&thumbnail_path)
        .map(Some)
        .map_err(|error| format!("Couldn't read drawing thumbnail: {error}"))
}

pub fn write_thumbnail(
    app: &AppHandle,
    relative_path: &str,
    thumbnail_svg: &str,
) -> CommandResult<()> {
    if !thumbnail_svg.trim_start().starts_with("<svg") {
        return Err("A thumbnail must be an SVG generated from an Excalidraw scene.".to_owned());
    }

    let root = active_library_root(app)?;
    resolve_existing_drawing_path(&root, relative_path)?;
    atomic_write(
        &thumbnail_path(&root, relative_path),
        thumbnail_svg.as_bytes(),
    )
}

pub fn create_drawing(
    app: &AppHandle,
    parent_path: &str,
    title: &str,
) -> CommandResult<DrawingSummary> {
    let root = active_library_root(app)?;
    let parent = resolve_directory_path(&root, parent_path)?;
    let file_name = drawing_file_name(title)?;
    let path = unique_path(&parent, &file_name);
    let scene = blank_scene();
    let serialized = serde_json::to_string(&scene)
        .map_err(|error| format!("Couldn't serialize blank drawing: {error}"))?;

    atomic_write(&path, serialized.as_bytes())?;
    drawing_summary(&root, &path)
}

pub fn create_folder(
    app: &AppHandle,
    parent_path: &str,
    name: &str,
) -> CommandResult<FolderSummary> {
    let root = active_library_root(app)?;
    let parent = resolve_directory_path(&root, parent_path)?;
    let name = folder_name(name)?;
    let folder = parent.join(name);

    if folder.exists() {
        return Err("A file or folder with that name already exists.".to_owned());
    }

    fs::create_dir(&folder).map_err(|error| format!("Couldn't create folder: {error}"))?;
    folder_summary(&root, &folder)
}

pub fn drawing_tags(app: &AppHandle, relative_path: &str) -> CommandResult<Vec<String>> {
    let root = active_library_root(app)?;
    let path = resolve_existing_drawing_path(&root, relative_path)?;
    read_finder_tags(&path)
}

pub fn set_drawing_tags(
    app: &AppHandle,
    relative_path: &str,
    tags: Vec<String>,
) -> CommandResult<()> {
    let root = active_library_root(app)?;
    let path = resolve_existing_drawing_path(&root, relative_path)?;
    let tags = normalize_tags(tags)?;
    if tags.is_empty() {
        return xattr::remove(path, FINDER_TAG_ATTRIBUTE)
            .or_else(|error| {
                if error.kind() == std::io::ErrorKind::NotFound {
                    Ok(())
                } else {
                    Err(error)
                }
            })
            .map_err(|error| format!("Couldn't remove Finder tags: {error}"));
    }

    let finder_tags = tags
        .into_iter()
        .map(|tag| format!("{tag}\n0"))
        .collect::<Vec<_>>();
    let mut encoded = Vec::new();
    plist::to_writer_binary(&mut encoded, &finder_tags)
        .map_err(|error| format!("Couldn't save Finder tags: {error}"))?;
    xattr::set(path, FINDER_TAG_ATTRIBUTE, &encoded)
        .map_err(|error| format!("Couldn't save Finder tags: {error}"))
}

pub fn delete_drawing(app: &AppHandle, relative_path: &str) -> CommandResult<()> {
    let root = active_library_root(app)?;
    let path = resolve_existing_drawing_path(&root, relative_path)?;
    fs::remove_file(path).map_err(|error| format!("Couldn't delete drawing: {error}"))?;
    invalidate_thumbnail(&root, relative_path);
    Ok(())
}

pub fn delete_folder(app: &AppHandle, relative_path: &str) -> CommandResult<()> {
    if relative_path.is_empty() {
        return Err("The library root can't be deleted from LocalCanvas.".to_owned());
    }

    let root = active_library_root(app)?;
    let path = resolve_directory_path(&root, relative_path)?;
    fs::remove_dir_all(path).map_err(|error| format!("Couldn't delete folder: {error}"))
}

pub fn rename_drawing(
    app: &AppHandle,
    relative_path: &str,
    title: &str,
) -> CommandResult<DrawingSummary> {
    let root = active_library_root(app)?;
    let source = resolve_existing_drawing_path(&root, relative_path)?;
    let destination = source
        .parent()
        .ok_or_else(|| "Couldn't determine the drawing folder.".to_owned())?
        .join(drawing_file_name(title)?);
    move_path(&source, &destination, "drawing")?;
    invalidate_thumbnail(&root, relative_path);
    drawing_summary(&root, &destination)
}

pub fn rename_folder(
    app: &AppHandle,
    relative_path: &str,
    name: &str,
) -> CommandResult<FolderSummary> {
    if relative_path.is_empty() {
        return Err("The library root can't be renamed from LocalCanvas.".to_owned());
    }

    let root = active_library_root(app)?;
    let source = resolve_directory_path(&root, relative_path)?;
    let destination = source
        .parent()
        .ok_or_else(|| "Couldn't determine the folder's parent.".to_owned())?
        .join(folder_name(name)?);
    move_path(&source, &destination, "folder")?;
    folder_summary(&root, &destination)
}

pub fn move_drawing(
    app: &AppHandle,
    relative_path: &str,
    parent_path: &str,
) -> CommandResult<DrawingSummary> {
    let root = active_library_root(app)?;
    let source = resolve_existing_drawing_path(&root, relative_path)?;
    let parent = resolve_directory_path(&root, parent_path)?;
    let file_name = source
        .file_name()
        .ok_or_else(|| "Drawing filename isn't valid.".to_owned())?;
    let destination = parent.join(file_name);
    move_path(&source, &destination, "drawing")?;
    invalidate_thumbnail(&root, relative_path);
    drawing_summary(&root, &destination)
}

pub fn move_folder(
    app: &AppHandle,
    relative_path: &str,
    parent_path: &str,
) -> CommandResult<FolderSummary> {
    if relative_path.is_empty() {
        return Err("The library root can't be moved from LocalCanvas.".to_owned());
    }

    let root = active_library_root(app)?;
    let source = resolve_directory_path(&root, relative_path)?;
    let parent = resolve_directory_path(&root, parent_path)?;
    if parent.starts_with(&source) {
        return Err("A folder can't be moved into itself or one of its children.".to_owned());
    }

    let name = source
        .file_name()
        .ok_or_else(|| "Folder name isn't valid.".to_owned())?;
    let destination = parent.join(name);
    move_path(&source, &destination, "folder")?;
    folder_summary(&root, &destination)
}

fn move_path(source: &Path, destination: &Path, item_kind: &str) -> CommandResult<()> {
    if source == destination {
        return Ok(());
    }
    if destination.exists() {
        return Err(format!(
            "A file or folder named '{}' already exists in that location.",
            destination
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
        ));
    }
    fs::rename(source, destination).map_err(|error| format!("Couldn't move {item_kind}: {error}"))
}

fn list_library(root: PathBuf) -> CommandResult<LibraryState> {
    let mut drawings = Vec::new();
    let mut folders = Vec::new();

    for entry in WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_entry(should_visit)
    {
        let entry = entry.map_err(|error| format!("Couldn't scan library: {error}"))?;
        let path = entry.path();

        if path == root {
            continue;
        }

        if entry.file_type().is_dir() {
            folders.push(folder_summary(&root, path)?);
        } else if is_excalidraw_file(path) {
            drawings.push(drawing_summary(&root, path)?);
        }
    }

    drawings.sort_by_key(|drawing| std::cmp::Reverse(drawing.modified_at));
    folders.sort_by(|left, right| left.path.cmp(&right.path));

    Ok(LibraryState {
        root: Some(path_to_string(&root)),
        drawings,
        folders,
        recent_paths: Vec::new(),
        pinned_paths: Vec::new(),
        history_enabled: true,
    })
}

fn should_visit(entry: &DirEntry) -> bool {
    entry.file_name() != LOCALCANVAS_DIR
}

fn drawing_summary(root: &Path, path: &Path) -> CommandResult<DrawingSummary> {
    let metadata =
        fs::metadata(path).map_err(|error| format!("Couldn't inspect drawing: {error}"))?;
    let modified_at = metadata
        .modified()
        .unwrap_or(SystemTime::UNIX_EPOCH)
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let title = path
        .file_stem()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Drawing filename isn't valid UTF-8.".to_owned())?
        .to_owned();

    Ok(DrawingSummary {
        path: relative_path(root, path)?,
        title,
        modified_at,
        tags: read_finder_tags(path)?,
    })
}

fn folder_summary(root: &Path, path: &Path) -> CommandResult<FolderSummary> {
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Folder name isn't valid UTF-8.".to_owned())?
        .to_owned();

    Ok(FolderSummary {
        path: relative_path(root, path)?,
        name,
    })
}

fn load_library_root(app: &AppHandle) -> CommandResult<Option<PathBuf>> {
    Ok(load_settings(app)?.library_root)
}

fn load_settings(app: &AppHandle) -> CommandResult<Settings> {
    let settings_path = settings_path(app)?;
    if !settings_path.exists() {
        return Ok(Settings::default());
    }

    let contents = fs::read_to_string(&settings_path)
        .map_err(|error| format!("Couldn't read LocalCanvas settings: {error}"))?;
    serde_json::from_str::<Settings>(&contents)
        .map_err(|error| format!("LocalCanvas settings are invalid: {error}"))
}

fn with_preferences(app: &AppHandle, mut state: LibraryState) -> CommandResult<LibraryState> {
    let settings = load_settings(app)?;
    let Some(root) = state.root.as_ref() else {
        return Ok(state);
    };
    let Some(preferences) = settings.preferences.get(root) else {
        return Ok(state);
    };
    let available_paths = state
        .drawings
        .iter()
        .map(|drawing| drawing.path.as_str())
        .collect::<Vec<_>>();
    state.recent_paths = preferences
        .recent_paths
        .iter()
        .filter(|path| available_paths.contains(&path.as_str()))
        .cloned()
        .collect();
    state.pinned_paths = preferences
        .pinned_paths
        .iter()
        .filter(|path| available_paths.contains(&path.as_str()))
        .cloned()
        .collect();
    state.history_enabled = preferences.history_enabled;
    Ok(state)
}

pub fn active_library_root(app: &AppHandle) -> CommandResult<PathBuf> {
    let root = load_library_root(app)?
        .ok_or_else(|| "Choose a LocalCanvas library folder first.".to_owned())?;
    let canonical_root = root
        .canonicalize()
        .map_err(|error| format!("Couldn't access the selected library: {error}"))?;

    if !canonical_root.is_dir() {
        return Err("The selected library is no longer a folder.".to_owned());
    }

    Ok(canonical_root)
}

fn save_settings(app: &AppHandle, settings: &Settings) -> CommandResult<()> {
    let path = settings_path(app)?;
    let serialized = serde_json::to_vec_pretty(settings)
        .map_err(|error| format!("Couldn't serialize LocalCanvas settings: {error}"))?;
    atomic_write(&path, &serialized)
}

fn settings_path(app: &AppHandle) -> CommandResult<PathBuf> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Couldn't find LocalCanvas application data: {error}"))?;
    Ok(data_dir.join(SETTINGS_FILE))
}

fn resolve_existing_drawing_path(root: &Path, relative_path: &str) -> CommandResult<PathBuf> {
    let candidate = safe_join(root, relative_path)?;
    if !is_excalidraw_file(&candidate) {
        return Err("Only .excalidraw scene files can be opened or saved here.".to_owned());
    }

    let path = candidate
        .canonicalize()
        .map_err(|error| format!("Couldn't access drawing: {error}"))?;

    if !path.starts_with(root) || !path.is_file() {
        return Err("Drawing path is outside the active library.".to_owned());
    }

    Ok(path)
}

fn resolve_directory_path(root: &Path, relative_path: &str) -> CommandResult<PathBuf> {
    let candidate = safe_join(root, relative_path)?;
    let path = candidate
        .canonicalize()
        .map_err(|error| format!("Couldn't access folder: {error}"))?;

    if !path.starts_with(root) || !path.is_dir() {
        return Err("Folder path is outside the active library.".to_owned());
    }

    Ok(path)
}

fn safe_join(root: &Path, relative_path: &str) -> CommandResult<PathBuf> {
    if relative_path.contains('\\') {
        return Err("Paths must use library-relative forward slashes.".to_owned());
    }

    let relative = Path::new(relative_path);
    if relative.is_absolute()
        || relative.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err("Path must stay inside the active library.".to_owned());
    }

    Ok(root.join(relative))
}

fn drawing_file_name(title: &str) -> CommandResult<String> {
    let title = title.trim().trim_end_matches(".excalidraw").trim();
    validate_name(title, "Drawing name")?;
    Ok(format!("{title}.excalidraw"))
}

fn folder_name(name: &str) -> CommandResult<String> {
    let name = name.trim();
    validate_name(name, "Folder name")?;
    Ok(name.to_owned())
}

fn read_finder_tags(path: &Path) -> CommandResult<Vec<String>> {
    let Some(encoded) = xattr::get(path, FINDER_TAG_ATTRIBUTE)
        .map_err(|error| format!("Couldn't read Finder tags: {error}"))?
    else {
        return Ok(Vec::new());
    };
    let tags = plist::from_bytes::<Vec<String>>(&encoded)
        .map_err(|error| format!("Couldn't read Finder tags: {error}"))?;
    Ok(tags.into_iter().map(strip_finder_tag_color).collect())
}

fn normalize_tags(tags: Vec<String>) -> CommandResult<Vec<String>> {
    let mut normalized = Vec::new();
    for tag in tags {
        let tag = tag.trim();
        if tag.is_empty() {
            continue;
        }
        if tag.contains(['\n', '\r']) || tag.len() > 64 {
            return Err("Tags must be one line and at most 64 characters.".to_owned());
        }
        if !normalized
            .iter()
            .any(|existing: &String| existing.eq_ignore_ascii_case(tag))
        {
            normalized.push(tag.to_owned());
        }
    }
    Ok(normalized)
}

fn strip_finder_tag_color(tag: String) -> String {
    tag.split_once('\n')
        .map_or(tag.clone(), |(name, _)| name.to_owned())
}

fn validate_name(name: &str, label: &str) -> CommandResult<()> {
    if name.is_empty() {
        return Err(format!("{label} can't be empty."));
    }
    if name == "." || name == ".." || name.contains(['/', '\\', '\0']) {
        return Err(format!("{label} can't contain path separators."));
    }
    Ok(())
}

fn unique_path(parent: &Path, file_name: &str) -> PathBuf {
    let candidate = parent.join(file_name);
    if !candidate.exists() {
        return candidate;
    }

    let stem = file_name.strip_suffix(".excalidraw").unwrap_or(file_name);
    for index in 2.. {
        let candidate = parent.join(format!("{stem} {index}.excalidraw"));
        if !candidate.exists() {
            return candidate;
        }
    }

    unreachable!("unbounded integer range always returns a candidate")
}

fn blank_scene() -> Value {
    json!({
        "type": "excalidraw",
        "version": 2,
        "source": "https://excalidraw.com",
        "elements": [],
        "appState": {
            "gridSize": null,
            "viewBackgroundColor": "#ffffff"
        },
        "files": {}
    })
}

fn validate_excalidraw_scene(scene_json: &str) -> CommandResult<()> {
    let scene: Value = serde_json::from_str(scene_json)
        .map_err(|error| format!("Couldn't save invalid JSON: {error}"))?;
    let object = scene
        .as_object()
        .ok_or_else(|| "A drawing must be a JSON object.".to_owned())?;

    if object.get("type").and_then(Value::as_str) != Some("excalidraw") {
        return Err("A drawing must use the upstream Excalidraw file format.".to_owned());
    }
    if !object.get("elements").is_some_and(Value::is_array) {
        return Err("An Excalidraw scene must contain an elements array.".to_owned());
    }
    if !object.get("appState").is_some_and(Value::is_object) {
        return Err("An Excalidraw scene must contain an appState object.".to_owned());
    }
    if !object.get("files").is_some_and(Value::is_object) {
        return Err("An Excalidraw scene must contain a files object.".to_owned());
    }

    Ok(())
}

fn invalidate_thumbnail(root: &Path, relative_path: &str) {
    let _ = fs::remove_file(thumbnail_path(root, relative_path));
}

fn thumbnail_path(root: &Path, relative_path: &str) -> PathBuf {
    root.join(LOCALCANVAS_DIR)
        .join(THUMBNAIL_DIR)
        .join(format!("{}.svg", sha256_hex(relative_path.as_bytes())))
}

fn sha256_hex(value: &[u8]) -> String {
    Sha256::digest(value)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn atomic_write(path: &Path, contents: &[u8]) -> CommandResult<()> {
    let parent = path
        .parent()
        .ok_or_else(|| "Couldn't determine output folder.".to_owned())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Couldn't create output folder: {error}"))?;

    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Output filename isn't valid UTF-8.".to_owned())?;
    let temp_path = parent.join(format!(".{file_name}.{}.tmp", Uuid::new_v4()));

    let write_result = (|| -> CommandResult<()> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
            .map_err(|error| format!("Couldn't create temporary save file: {error}"))?;
        file.write_all(contents)
            .map_err(|error| format!("Couldn't write temporary save file: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("Couldn't flush temporary save file: {error}"))?;
        fs::rename(&temp_path, path).map_err(|error| format!("Couldn't finalize save: {error}"))?;
        Ok(())
    })();

    if write_result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }

    write_result
}

fn is_excalidraw_file(path: &Path) -> bool {
    path.extension()
        .is_some_and(|extension| extension == "excalidraw")
}

fn relative_path(root: &Path, path: &Path) -> CommandResult<String> {
    let relative = path
        .strip_prefix(root)
        .map_err(|_| "Path is outside the active library.".to_owned())?;
    Ok(path_to_string(relative))
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

#[cfg(test)]
mod tests {
    use super::{
        atomic_write, blank_scene, drawing_file_name, invalidate_thumbnail, list_versions_at,
        read_version_at, restore_version_at, safe_join, thumbnail_path, validate_excalidraw_scene,
        write_scene_at,
    };
    use std::{env, fs};
    use uuid::Uuid;

    #[test]
    fn rejects_paths_that_escape_the_library() {
        let root = env::temp_dir();
        assert!(safe_join(&root, "../outside.excalidraw").is_err());
        assert!(safe_join(&root, "/outside.excalidraw").is_err());
        assert!(safe_join(&root, "folder\\outside.excalidraw").is_err());
    }

    #[test]
    fn creates_an_upstream_excalidraw_blank_scene() {
        let scene = serde_json::to_string(&blank_scene()).expect("blank scene serializes");
        validate_excalidraw_scene(&scene).expect("blank scene is valid");
    }

    #[test]
    fn atomic_write_replaces_existing_file_without_leaving_temp_files() {
        let directory = env::temp_dir().join(format!("localcanvas-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).expect("create test directory");
        let path = directory.join("drawing.excalidraw");

        atomic_write(&path, b"first").expect("write first version");
        atomic_write(&path, b"second").expect("replace with second version");

        assert_eq!(
            fs::read_to_string(&path).expect("read saved file"),
            "second"
        );
        assert_eq!(
            fs::read_dir(&directory)
                .expect("read test directory")
                .count(),
            1
        );
        fs::remove_dir_all(directory).expect("remove test directory");
    }

    #[test]
    fn keeps_thumbnail_cache_paths_inside_localcanvas() {
        let root = env::temp_dir();
        let first = thumbnail_path(&root, "Architecture/auth-flow.excalidraw");
        let second = thumbnail_path(&root, "Architecture/db-schema.excalidraw");

        assert_ne!(first, second);
        assert_eq!(
            first.parent().unwrap(),
            root.join(".localcanvas/thumbnails")
        );
        assert_eq!(first.extension().unwrap(), "svg");
    }

    #[test]
    fn invalidates_the_cached_thumbnail_after_a_scene_save() {
        let root = env::temp_dir().join(format!("localcanvas-test-{}", Uuid::new_v4()));
        let drawing_path = "Architecture/auth-flow.excalidraw";
        let thumbnail = thumbnail_path(&root, drawing_path);
        fs::create_dir_all(thumbnail.parent().unwrap()).expect("create thumbnail cache");
        fs::write(&thumbnail, "<svg />").expect("write thumbnail");

        invalidate_thumbnail(&root, drawing_path);

        assert!(!thumbnail.exists());
        fs::remove_dir_all(root).expect("remove test directory");
    }

    #[test]
    fn captures_and_restores_scene_versions_without_losing_the_current_scene() {
        let root = env::temp_dir().join(format!("localcanvas-test-{}", Uuid::new_v4()));
        let relative_path = "history.excalidraw";
        fs::create_dir_all(&root).expect("create library root");
        let root = root.canonicalize().expect("canonical library root");
        let first = versioned_scene("first");
        let second = versioned_scene("second");
        fs::write(root.join(relative_path), &first).expect("write initial scene");

        write_scene_at(&root, relative_path, &second, true).expect("save updated scene");
        let versions = list_versions_at(&root, relative_path).expect("list saved versions");
        assert_eq!(versions.len(), 1);
        assert_eq!(
            read_version_at(&root, relative_path, &versions[0].id).expect("read prior scene"),
            first,
        );

        restore_version_at(&root, relative_path, &versions[0].id).expect("restore prior scene");
        assert_eq!(fs::read_to_string(root.join(relative_path)).unwrap(), first);
        let versions = list_versions_at(&root, relative_path).expect("list versions after restore");
        assert_eq!(versions.len(), 2);
        assert!(versions.iter().any(|version| {
            read_version_at(&root, relative_path, &version.id).as_deref() == Ok(second.as_str())
        }));
        fs::remove_dir_all(root).expect("remove test directory");
    }

    #[test]
    fn does_not_snapshot_viewport_only_autosaves() {
        let root = env::temp_dir().join(format!("localcanvas-test-{}", Uuid::new_v4()));
        let relative_path = "history.excalidraw";
        fs::create_dir_all(&root).expect("create library root");
        let root = root.canonicalize().expect("canonical library root");
        let first = versioned_scene("first");
        let mut viewport_only_change: serde_json::Value = serde_json::from_str(&first).unwrap();
        viewport_only_change["appState"] = serde_json::json!({ "scrollX": 120, "scrollY": 45 });
        fs::write(root.join(relative_path), &first).expect("write initial scene");

        write_scene_at(&root, relative_path, &viewport_only_change.to_string(), true)
            .expect("save viewport change");

        assert!(list_versions_at(&root, relative_path).unwrap().is_empty());
        fs::remove_dir_all(root).expect("remove test directory");
    }

    #[test]
    fn does_not_create_versions_when_history_is_disabled() {
        let root = env::temp_dir().join(format!("localcanvas-test-{}", Uuid::new_v4()));
        let relative_path = "history.excalidraw";
        fs::create_dir_all(&root).expect("create library root");
        let root = root.canonicalize().expect("canonical library root");
        fs::write(root.join(relative_path), versioned_scene("first")).expect("write initial scene");

        write_scene_at(&root, relative_path, &versioned_scene("second"), false)
            .expect("save changed scene");

        assert!(list_versions_at(&root, relative_path).unwrap().is_empty());
        fs::remove_dir_all(root).expect("remove test directory");
    }

    fn versioned_scene(label: &str) -> String {
        serde_json::json!({
            "type": "excalidraw",
            "elements": [{
                "customData": {
                    "localcanvas": {
                        "kind": "drawing-metadata",
                        "drawingId": "59d2eea8-dbd6-45a1-b8d9-9395ea418091"
                    }
                }
            }, { "type": "text", "text": label }],
            "appState": {},
            "files": {}
        })
        .to_string()
    }

    #[test]
    fn adds_the_excalidraw_extension_once() {
        assert_eq!(
            drawing_file_name("Architecture").unwrap(),
            "Architecture.excalidraw"
        );
        assert_eq!(
            drawing_file_name("Architecture.excalidraw").unwrap(),
            "Architecture.excalidraw"
        );
    }
}
