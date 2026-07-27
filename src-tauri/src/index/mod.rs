use rusqlite::{params, Connection};
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};
use walkdir::{DirEntry, WalkDir};

use crate::fs::library::{CommandResult, DrawingSummary};

const CACHE_DIRECTORY: &str = ".localcanvas";
const DATABASE_FILE: &str = "index.sqlite";
const MAX_SEARCH_RESULTS: usize = 100;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexStats {
    pub drawing_count: usize,
    pub indexed_text_elements: usize,
}

pub fn rebuild(root: &Path) -> CommandResult<IndexStats> {
    let entries = scan_drawings(root)?;
    let drawing_count = entries.len();
    let database_path = root.join(CACHE_DIRECTORY).join(DATABASE_FILE);
    let mut connection = open_rebuildable_database(&database_path)?;
    create_schema(&connection)?;

    let transaction = connection
        .transaction()
        .map_err(|error| format!("Couldn't start index rebuild: {error}"))?;
    transaction
        .execute_batch(
            "DELETE FROM links; DELETE FROM text_index; DELETE FROM tags; DELETE FROM drawings;",
        )
        .map_err(|error| format!("Couldn't reset search index: {error}"))?;

    let mut indexed_text_elements = 0;
    for entry in entries {
        let document_id = cache_id(&entry.path);
        let text = extract_text(&entry.contents);
        indexed_text_elements += text.len();
        let content = text.join("\n");

        transaction
            .execute(
                "INSERT INTO drawings (id, path, title, updated_at, content_hash) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![document_id, entry.path, entry.title, entry.modified_at.to_string(), content_hash(&entry.contents)],
            )
            .map_err(|error| format!("Couldn't add drawing to index: {error}"))?;
        transaction
            .execute(
                "INSERT INTO text_index (drawing_id, content) VALUES (?1, ?2)",
                params![cache_id(&entry.path), content],
            )
            .map_err(|error| format!("Couldn't add drawing text to index: {error}"))?;
    }

    transaction
        .commit()
        .map_err(|error| format!("Couldn't finalize index rebuild: {error}"))?;

    Ok(IndexStats {
        drawing_count,
        indexed_text_elements,
    })
}

pub fn search(root: &Path, query: &str) -> CommandResult<Vec<DrawingSummary>> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let database_path = root.join(CACHE_DIRECTORY).join(DATABASE_FILE);
    if !database_path.exists() {
        rebuild(root)?;
    }

    let connection = Connection::open(&database_path)
        .map_err(|error| format!("Couldn't open search index: {error}"))?;
    if create_schema(&connection).is_err() {
        rebuild(root)?;
        return search(root, query);
    }

    let pattern = format!("%{}%", query.to_lowercase());
    let mut statement = connection
        .prepare(
            "SELECT drawings.path, drawings.title, drawings.updated_at
             FROM drawings
             LEFT JOIN text_index ON drawings.id = text_index.drawing_id
             WHERE lower(drawings.title) LIKE ?1 OR lower(COALESCE(text_index.content, '')) LIKE ?1
             ORDER BY drawings.updated_at DESC
             LIMIT ?2",
        )
        .map_err(|error| format!("Couldn't prepare search: {error}"))?;
    let results = statement
        .query_map(params![pattern, MAX_SEARCH_RESULTS as i64], |row| {
            let modified_at: String = row.get(2)?;
            Ok(DrawingSummary {
                path: row.get(0)?,
                title: row.get(1)?,
                modified_at: modified_at.parse().unwrap_or_default(),
                tags: Vec::new(),
            })
        })
        .map_err(|error| format!("Couldn't run search: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Couldn't read search results: {error}"))?;

    Ok(results)
}

fn open_rebuildable_database(path: &Path) -> CommandResult<Connection> {
    let parent = path
        .parent()
        .ok_or_else(|| "Couldn't determine index folder.".to_owned())?;
    fs::create_dir_all(parent).map_err(|error| format!("Couldn't create index folder: {error}"))?;

    let connection =
        Connection::open(path).map_err(|error| format!("Couldn't open search index: {error}"))?;
    if create_schema(&connection).is_ok() {
        return Ok(connection);
    }

    drop(connection);
    let _ = fs::remove_file(path);
    Connection::open(path).map_err(|error| format!("Couldn't recreate search index: {error}"))
}

fn create_schema(connection: &Connection) -> CommandResult<()> {
    connection
        .execute_batch(
            "
            PRAGMA journal_mode = DELETE;
            CREATE TABLE IF NOT EXISTS drawings (
              id TEXT PRIMARY KEY,
              path TEXT NOT NULL UNIQUE,
              title TEXT,
              updated_at TEXT NOT NULL,
              content_hash TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS links (
              source_id TEXT NOT NULL,
              target_id TEXT NOT NULL,
              FOREIGN KEY(source_id) REFERENCES drawings(id),
              FOREIGN KEY(target_id) REFERENCES drawings(id)
            );
            CREATE TABLE IF NOT EXISTS text_index (
              drawing_id TEXT PRIMARY KEY,
              content TEXT NOT NULL,
              FOREIGN KEY(drawing_id) REFERENCES drawings(id)
            );
            CREATE TABLE IF NOT EXISTS tags (
              drawing_id TEXT NOT NULL,
              tag TEXT NOT NULL,
              FOREIGN KEY(drawing_id) REFERENCES drawings(id)
            );
            CREATE INDEX IF NOT EXISTS text_index_drawing_id ON text_index(drawing_id);
            CREATE INDEX IF NOT EXISTS drawings_updated_at ON drawings(updated_at DESC);
            ",
        )
        .map_err(|error| format!("Couldn't initialize search index: {error}"))
}

struct IndexedDrawing {
    path: String,
    title: String,
    modified_at: u128,
    contents: String,
}

fn scan_drawings(root: &Path) -> CommandResult<Vec<IndexedDrawing>> {
    let mut drawings = Vec::new();
    for entry in WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(should_visit)
    {
        let entry = entry.map_err(|error| format!("Couldn't scan library for search: {error}"))?;
        let path = entry.path();
        if entry.file_type().is_file() && is_excalidraw_file(path) {
            drawings.push(indexed_drawing(root, path)?);
        }
    }
    Ok(drawings)
}

fn should_visit(entry: &DirEntry) -> bool {
    entry.file_name() != CACHE_DIRECTORY
}

fn indexed_drawing(root: &Path, path: &Path) -> CommandResult<IndexedDrawing> {
    let contents = fs::read_to_string(path)
        .map_err(|error| format!("Couldn't read drawing for search: {error}"))?;
    let modified_at = fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .unwrap_or(SystemTime::UNIX_EPOCH)
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let relative_path = path
        .strip_prefix(root)
        .map_err(|_| "Drawing is outside the active library.".to_owned())?
        .to_string_lossy()
        .replace('\\', "/");
    let title = path
        .file_stem()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Drawing filename isn't valid UTF-8.".to_owned())?
        .to_owned();

    Ok(IndexedDrawing {
        path: relative_path,
        title,
        modified_at,
        contents,
    })
}

fn extract_text(contents: &str) -> Vec<String> {
    let Ok(scene) = serde_json::from_str::<Value>(contents) else {
        return Vec::new();
    };
    let Some(elements) = scene.get("elements").and_then(Value::as_array) else {
        return Vec::new();
    };

    elements
        .iter()
        .filter(|element| {
            element.get("type").and_then(Value::as_str) == Some("text")
                && !element
                    .get("isDeleted")
                    .and_then(Value::as_bool)
                    .unwrap_or(false)
        })
        .filter_map(|element| {
            element
                .get("text")
                .or_else(|| element.get("originalText"))
                .and_then(Value::as_str)
        })
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

fn is_excalidraw_file(path: &Path) -> bool {
    path.extension()
        .is_some_and(|extension| extension == "excalidraw")
}

fn cache_id(path: &str) -> String {
    // The index is derived data, so this key is intentionally derived from the
    // current path. Durable UUIDs are introduced with the portal feature and
    // stored in element customData, never as a custom scene-level field.
    format!("cache:{}", content_hash(path))
}

fn content_hash(contents: &str) -> String {
    Sha256::digest(contents.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{rebuild, search};
    use std::{env, fs};
    use uuid::Uuid;

    #[test]
    fn rebuilds_from_scene_files_and_searches_text_and_titles() {
        let root = env::temp_dir().join(format!("localcanvas-index-test-{}", Uuid::new_v4()));
        fs::create_dir_all(root.join("Architecture")).expect("create test library");
        fs::write(
            root.join("Architecture/auth-flow.excalidraw"),
            r#"{"type":"excalidraw","elements":[{"type":"text","text":"Sign in with passkeys","isDeleted":false},{"type":"text","text":"ignored","isDeleted":true}],"appState":{},"files":{}}"#,
        )
        .expect("write drawing");
        fs::write(
            root.join("roadmap.excalidraw"),
            r#"{"type":"excalidraw","elements":[],"appState":{},"files":{}}"#,
        )
        .expect("write drawing");

        let stats = rebuild(&root).expect("rebuild index");
        assert_eq!(stats.drawing_count, 2);
        assert_eq!(stats.indexed_text_elements, 1);
        assert_eq!(
            search(&root, "passkey").unwrap()[0].path,
            "Architecture/auth-flow.excalidraw"
        );
        assert_eq!(
            search(&root, "roadmap").unwrap()[0].path,
            "roadmap.excalidraw"
        );
        assert!(search(&root, "ignored").unwrap().is_empty());

        fs::remove_dir_all(root).expect("remove test library");
    }

    #[test]
    fn recreates_a_corrupt_index_from_the_filesystem() {
        let root = env::temp_dir().join(format!("localcanvas-index-test-{}", Uuid::new_v4()));
        fs::create_dir_all(root.join(".localcanvas")).expect("create cache directory");
        fs::write(
            root.join("diagram.excalidraw"),
            r#"{"type":"excalidraw","elements":[{"type":"text","text":"Recover from cache corruption","isDeleted":false}],"appState":{},"files":{}}"#,
        )
        .expect("write drawing");
        fs::write(
            root.join(".localcanvas/index.sqlite"),
            "not a SQLite database",
        )
        .expect("write corrupt index");

        assert_eq!(rebuild(&root).unwrap().drawing_count, 1);
        assert_eq!(search(&root, "corruption").unwrap().len(), 1);

        fs::remove_dir_all(root).expect("remove test library");
    }

    #[test]
    fn recreates_a_missing_index_from_the_filesystem() {
        let root = env::temp_dir().join(format!("localcanvas-index-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).expect("create test library");
        fs::write(
            root.join("notes.excalidraw"),
            r#"{"type":"excalidraw","elements":[{"type":"text","text":"Offline notes","isDeleted":false}],"appState":{},"files":{}}"#,
        )
        .expect("write drawing");

        rebuild(&root).expect("build initial index");
        fs::remove_file(root.join(".localcanvas/index.sqlite")).expect("delete derived index");
        assert_eq!(search(&root, "offline").unwrap().len(), 1);

        fs::remove_dir_all(root).expect("remove test library");
    }
}
