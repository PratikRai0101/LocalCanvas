use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
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
pub struct LibraryState {
    pub root: Option<String>,
    pub drawings: Vec<DrawingSummary>,
    pub folders: Vec<FolderSummary>,
}

#[derive(Debug, Deserialize, Serialize, Default)]
struct Settings {
    library_root: Option<PathBuf>,
}

pub fn get_library_state(app: &AppHandle) -> CommandResult<LibraryState> {
    match load_library_root(app)? {
        Some(root) if root.is_dir() => list_library(root),
        Some(root) => Ok(LibraryState {
            root: Some(path_to_string(&root)),
            drawings: Vec::new(),
            folders: Vec::new(),
        }),
        None => Ok(LibraryState {
            root: None,
            drawings: Vec::new(),
            folders: Vec::new(),
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

    save_settings(
        app,
        &Settings {
            library_root: Some(root.clone()),
        },
    )?;

    list_library(root)
}

pub fn read_scene(app: &AppHandle, relative_path: &str) -> CommandResult<String> {
    let root = active_library_root(app)?;
    let path = resolve_existing_drawing_path(&root, relative_path)?;

    fs::read_to_string(&path).map_err(|error| format!("Couldn't read drawing: {error}"))
}

pub fn write_scene(app: &AppHandle, relative_path: &str, scene_json: &str) -> CommandResult<()> {
    let root = active_library_root(app)?;
    let path = resolve_existing_drawing_path(&root, relative_path)?;
    validate_excalidraw_scene(scene_json)?;
    atomic_write(&path, scene_json.as_bytes())?;
    invalidate_thumbnail(&root, relative_path);
    Ok(())
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

pub fn import_drawing(
    app: &AppHandle,
    parent_path: &str,
    source_path: &Path,
) -> CommandResult<DrawingSummary> {
    if !is_excalidraw_file(source_path) {
        return Err("Choose a standard .excalidraw file to import.".to_owned());
    }

    let root = active_library_root(app)?;
    let parent = resolve_directory_path(&root, parent_path)?;
    let contents = fs::read_to_string(source_path)
        .map_err(|error| format!("Couldn't read drawing to import: {error}"))?;
    validate_excalidraw_scene(&contents)?;
    let title = source_path
        .file_stem()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Drawing filename isn't valid UTF-8.".to_owned())?;
    let destination = unique_path(&parent, &drawing_file_name(title)?);

    atomic_write(&destination, contents.as_bytes())?;
    drawing_summary(&root, &destination)
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
    let settings_path = settings_path(app)?;
    if !settings_path.exists() {
        return Ok(None);
    }

    let contents = fs::read_to_string(&settings_path)
        .map_err(|error| format!("Couldn't read LocalCanvas settings: {error}"))?;
    let settings = serde_json::from_str::<Settings>(&contents)
        .map_err(|error| format!("LocalCanvas settings are invalid: {error}"))?;

    Ok(settings.library_root)
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
    let hash = Sha256::digest(relative_path.as_bytes());
    let file_name = hash
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    root.join(LOCALCANVAS_DIR)
        .join(THUMBNAIL_DIR)
        .join(format!("{file_name}.svg"))
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
        atomic_write, blank_scene, drawing_file_name, invalidate_thumbnail, safe_join,
        thumbnail_path, validate_excalidraw_scene,
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
