use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::{path::Path, sync::Mutex};
use tauri::{AppHandle, Emitter};

const CACHE_DIRECTORY: &str = ".localcanvas";

pub struct LibraryWatcher(pub Mutex<Option<RecommendedWatcher>>);

impl Default for LibraryWatcher {
    fn default() -> Self {
        Self(Mutex::new(None))
    }
}

pub fn watch_library(
    app: &AppHandle,
    watcher_state: &LibraryWatcher,
    root: &Path,
) -> Result<(), String> {
    let app_handle = app.clone();
    let root = root.to_path_buf();
    let event_root = root.clone();
    let mut watcher = notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
        let Ok(event) = result else {
            return;
        };
        if event
            .paths
            .iter()
            .any(|path| !is_derived_path(&event_root, path))
        {
            let _ = app_handle.emit("library-changed", ());
        }
    })
    .map_err(|error| format!("Couldn't start library watcher: {error}"))?;

    watcher
        .watch(root.as_path(), RecursiveMode::Recursive)
        .map_err(|error| format!("Couldn't watch the library: {error}"))?;

    let mut active_watcher = watcher_state
        .0
        .lock()
        .map_err(|_| "Couldn't update the library watcher.".to_owned())?;
    *active_watcher = Some(watcher);
    Ok(())
}

fn is_derived_path(root: &Path, path: &Path) -> bool {
    path.strip_prefix(root)
        .ok()
        .and_then(|relative| relative.components().next())
        .is_some_and(|component| component.as_os_str() == CACHE_DIRECTORY)
}

#[cfg(test)]
mod tests {
    use super::is_derived_path;
    use std::path::Path;

    #[test]
    fn ignores_changes_to_rebuildable_cache_data() {
        let root = Path::new("/Library");
        assert!(is_derived_path(
            root,
            Path::new("/Library/.localcanvas/index.sqlite")
        ));
        assert!(!is_derived_path(
            root,
            Path::new("/Library/notes.excalidraw")
        ));
    }
}
