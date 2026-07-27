import { listen } from "@tauri-apps/api/event";
import { loadFromBlob, serializeAsJSON } from "@excalidraw/excalidraw";
import { FormEvent, MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Canvas, SaveStatus } from "./canvas/Canvas";
import {
  DrawingSummary,
  FolderSummary,
  LibraryState,
  libraryApi,
} from "./library/api";
import { ThumbnailGrid } from "./library/ThumbnailGrid";
import { CommandPalette } from "./search/CommandPalette";
import "./App.css";

type DialogKind = "drawing" | "folder" | null;
type ContextTarget = {
  kind: "drawing" | "folder";
  path: string;
  label: string;
  x: number;
  y: number;
};

const EMPTY_LIBRARY: LibraryState = {
  root: null,
  drawings: [],
  folders: [],
  recentPaths: [],
  pinnedPaths: [],
};

function App() {
  const [library, setLibrary] = useState<LibraryState>(EMPTY_LIBRARY);
  const [activeDrawing, setActiveDrawing] = useState<DrawingSummary | null>(null);
  const [selectedFolderPath, setSelectedFolderPath] = useState("");
  const [dialogKind, setDialogKind] = useState<DialogKind>(null);
  const [newItemName, setNewItemName] = useState("");
  const [newItemFolder, setNewItemFolder] = useState("");
  const [isChoosingRoot, setIsChoosingRoot] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DrawingSummary[] | null>(null);
  const handleSaveStatus = useCallback((status: SaveStatus) => {
    if (status === "error") {
      setError("Couldn’t save this drawing. Your latest changes may not be on disk.");
    }
  }, []);
  const [contextTarget, setContextTarget] = useState<ContextTarget | null>(null);
  const [editTarget, setEditTarget] = useState<ContextTarget | null>(null);
  const [editAction, setEditAction] = useState<"rename" | "move" | null>(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [tagTarget, setTagTarget] = useState<ContextTarget | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const refreshLibrary = useCallback(async () => {
    try {
      const nextLibrary = await libraryApi.getState();
      setLibrary(nextLibrary);
      setError(null);
      return nextLibrary;
    } catch (cause) {
      const message = asMessage(cause, "Couldn’t load the LocalCanvas library.");
      setError(message);
      throw cause;
    }
  }, []);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery || !library.root) {
      setSearchResults(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void libraryApi.searchDrawings(normalizedQuery)
        .then((results) => {
          if (!cancelled) {
            setSearchResults(results);
          }
        })
        .catch((cause) => {
          console.error("Failed to search drawings", cause);
          if (!cancelled) {
            setSearchResults([]);
          }
        });
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [library.root, query]);

  const visibleDrawings = useMemo(() => {
    const searchedDrawings = query.trim() ? searchResults ?? [] : library.drawings;
    return searchedDrawings.filter((drawing) =>
      (!selectedFolderPath || drawing.path.startsWith(`${selectedFolderPath}/`))
      && (!selectedTag || drawing.tags.includes(selectedTag)),
    );
  }, [library.drawings, query, searchResults, selectedFolderPath, selectedTag]);

  const libraryTags = useMemo(() => [...new Set(library.drawings.flatMap((drawing) => drawing.tags))].sort(), [library.drawings]);

  const pinnedDrawings = useMemo(
    () => drawingPathsToSummaries(library.drawings, library.pinnedPaths ?? []),
    [library.drawings, library.pinnedPaths],
  );
  const recentDrawings = useMemo(
    () => drawingPathsToSummaries(library.drawings, library.recentPaths ?? []).slice(0, 6),
    [library.drawings, library.recentPaths],
  );
  const handleCanvasSaved = useCallback(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  async function importExistingDrawing() {
    if (!library.root) {
      return;
    }

    setIsCreating(true);
    try {
      const imported = await libraryApi.pickImportScene();
      const restored = await loadFromBlob(
        new Blob([new Uint8Array(imported.contents)], { type: imported.mimeType }),
        null,
        null,
      );
      const drawing = await libraryApi.createDrawing(
        selectedFolderPath,
        imported.fileName.replace(/\.(excalidraw|png|svg)$/i, "") || "Imported drawing",
      );
      await libraryApi.writeScene(
        drawing.path,
        serializeAsJSON(restored.elements, restored.appState, restored.files, "local"),
      );
      await libraryApi.recordDrawingOpened(drawing.path);
      const nextLibrary = await refreshLibrary();
      setActiveDrawing(nextLibrary.drawings.find((item) => item.path === drawing.path) ?? drawing);
      setSelectedFolderPath(parentPath(drawing.path));
    } catch (cause) {
      const message = asMessage(cause, "Couldn’t import the drawing.");
      if (message !== "No drawing was selected.") {
        setError(message);
      }
    } finally {
      setIsCreating(false);
    }
  }

  async function chooseLibraryRoot() {
    setIsChoosingRoot(true);
    try {
      const nextLibrary = await libraryApi.chooseRoot();
      setLibrary(nextLibrary);
      setActiveDrawing(null);
      setSelectedFolderPath("");
      setError(null);
    } catch (cause) {
      setError(asMessage(cause, "Couldn’t open the selected folder."));
    } finally {
      setIsChoosingRoot(false);
    }
  }

  function openDialog(kind: Exclude<DialogKind, null>) {
    setDialogKind(kind);
    setNewItemName(kind === "drawing" ? "Untitled" : "New folder");
    setNewItemFolder(selectedFolderPath);
    setError(null);
  }

  function closeDialog() {
    if (!isCreating) {
      setDialogKind(null);
    }
  }

  function openEditDialog(action: "rename" | "move") {
    if (!contextTarget) {
      return;
    }
    const target = contextTarget;
    setContextTarget(null);
    setEditTarget(target);
    setEditAction(action);
    setNewItemName(target.label);
    setNewItemFolder(parentPath(target.path));
    setError(null);
  }

  function closeEditDialog() {
    if (!isCreating) {
      setEditTarget(null);
      setEditAction(null);
    }
  }

  async function updateItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editTarget || !editAction) {
      return;
    }

    setIsCreating(true);
    try {
      const result = editAction === "rename"
        ? editTarget.kind === "drawing"
          ? await libraryApi.renameDrawing(editTarget.path, newItemName)
          : await libraryApi.renameFolder(editTarget.path, newItemName)
        : editTarget.kind === "drawing"
          ? await libraryApi.moveDrawing(editTarget.path, newItemFolder)
          : await libraryApi.moveFolder(editTarget.path, newItemFolder);
      const nextLibrary = await refreshLibrary();

      if (editTarget.kind === "drawing" && activeDrawing?.path === editTarget.path) {
        const updatedDrawing = nextLibrary.drawings.find((drawing) => drawing.path === result.path);
        setActiveDrawing(updatedDrawing ?? null);
        setSelectedFolderPath(parentPath(result.path));
      }
      if (editTarget.kind === "folder") {
        if (selectedFolderPath === editTarget.path || selectedFolderPath.startsWith(`${editTarget.path}/`)) {
          setSelectedFolderPath(`${result.path}${selectedFolderPath.slice(editTarget.path.length)}`);
        }
        if (activeDrawing?.path.startsWith(`${editTarget.path}/`)) {
          const nextPath = `${result.path}${activeDrawing.path.slice(editTarget.path.length)}`;
          setActiveDrawing(nextLibrary.drawings.find((drawing) => drawing.path === nextPath) ?? null);
        }
      }
      setEditTarget(null);
      setEditAction(null);
    } catch (cause) {
      setError(asMessage(cause, `Couldn’t ${editAction} ${editTarget.kind}.`));
    } finally {
      setIsCreating(false);
    }
  }

  async function createItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialogKind) {
      return;
    }

    setIsCreating(true);
    try {
      if (dialogKind === "drawing") {
        const drawing = await libraryApi.createDrawing(newItemFolder, newItemName);
        await libraryApi.recordDrawingOpened(drawing.path);
        const nextLibrary = await refreshLibrary();
        setActiveDrawing(
          nextLibrary.drawings.find((item) => item.path === drawing.path) ?? drawing,
        );
        setSelectedFolderPath(parentPath(drawing.path));
        handleSaveStatus("saved");
      } else {
        const folder = await libraryApi.createFolder(newItemFolder, newItemName);
        await refreshLibrary();
        setSelectedFolderPath(folder.path);
      }
      setDialogKind(null);
    } catch (cause) {
      setError(asMessage(cause, "Couldn’t create the item."));
    } finally {
      setIsCreating(false);
    }
  }

  function selectDrawing(drawing: DrawingSummary) {
    setActiveDrawing(drawing);
    setSelectedFolderPath(parentPath(drawing.path));
    handleSaveStatus("saved");
    setError(null);
    void libraryApi.recordDrawingOpened(drawing.path)
      .then(() => refreshLibrary())
      .catch((cause) => setError(asMessage(cause, "Couldn’t update recent drawings.")));
  }

  async function togglePinnedDrawing() {
    if (!contextTarget || contextTarget.kind !== "drawing") {
      return;
    }
    const target = contextTarget;
    setContextTarget(null);
    try {
      await libraryApi.setDrawingPinned(target.path, !(library.pinnedPaths ?? []).includes(target.path));
      await refreshLibrary();
    } catch (cause) {
      setError(asMessage(cause, "Couldn’t update the pinned drawing."));
    }
  }

  function browseFolder(path: string) {
    setSelectedFolderPath(path);
    setActiveDrawing(null);
  }

  function openContextMenu(
    event: MouseEvent<HTMLButtonElement>,
    target: Omit<ContextTarget, "x" | "y">,
  ) {
    event.preventDefault();
    setContextTarget({
      ...target,
      x: Math.min(event.clientX, window.innerWidth - 190),
      y: Math.min(event.clientY, window.innerHeight - 54),
    });
  }

  async function openTagDialog() {
    if (!contextTarget || contextTarget.kind !== "drawing") {
      return;
    }
    const target = contextTarget;
    setContextTarget(null);
    try {
      const tags = await libraryApi.getDrawingTags(target.path);
      setTagInput(tags.join(", "));
      setTagTarget(target);
    } catch (cause) {
      setError(asMessage(cause, "Couldn’t read Finder tags."));
    }
  }

  async function saveTags(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tagTarget) {
      return;
    }
    setIsCreating(true);
    try {
      await libraryApi.setDrawingTags(tagTarget.path, tagInput.split(","));
      await refreshLibrary();
      setTagTarget(null);
    } catch (cause) {
      setError(asMessage(cause, "Couldn’t save Finder tags."));
    } finally {
      setIsCreating(false);
    }
  }

  async function deleteContextTarget() {
    if (!contextTarget) {
      return;
    }

    const { kind, path, label } = contextTarget;
    setContextTarget(null);
    const description = kind === "drawing" ? `drawing “${label}”` : `folder “${label}” and all of its contents`;
    if (!window.confirm(`Delete ${description}? This can’t be undone.`)) {
      return;
    }

    try {
      if (kind === "drawing") {
        await libraryApi.deleteDrawing(path);
        if (activeDrawing?.path === path) {
          setActiveDrawing(null);
        }
      } else {
        await libraryApi.deleteFolder(path);
        if (activeDrawing?.path.startsWith(`${path}/`)) {
          setActiveDrawing(null);
        }
        if (selectedFolderPath === path || selectedFolderPath.startsWith(`${path}/`)) {
          setSelectedFolderPath("");
        }
      }
      await refreshLibrary();
    } catch (cause) {
      setError(asMessage(cause, `Couldn’t delete ${kind}.`));
    }
  }

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) {
        return;
      }

      if (event.key.toLowerCase() === "n" && library.root) {
        event.preventDefault();
        openDialog(event.shiftKey ? "folder" : "drawing");
      }
      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsCommandPaletteOpen(true);
      }
      if (event.key.toLowerCase() === "o" && library.root) {
        event.preventDefault();
        void importExistingDrawing();
      }
      if (event.key.toLowerCase() === "r" && activeDrawing) {
        event.preventDefault();
        setEditTarget({ kind: "drawing", path: activeDrawing.path, label: activeDrawing.title, x: 0, y: 0 });
        setEditAction("rename");
        setNewItemName(activeDrawing.title);
        setError(null);
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [activeDrawing, library.root, selectedFolderPath]);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) {
      return;
    }

    let unlisten: (() => void) | undefined;
    void listen<string>("menu-action", ({ payload }) => {
      if (payload === "import-drawing" && library.root) {
        void importExistingDrawing();
      } else if (payload === "new-drawing" && library.root) {
        openDialog("drawing");
      } else if (payload === "new-folder" && library.root) {
        openDialog("folder");
      } else if (payload === "rename-active" && activeDrawing) {
        setEditTarget({ kind: "drawing", path: activeDrawing.path, label: activeDrawing.title, x: 0, y: 0 });
        setEditAction("rename");
        setNewItemName(activeDrawing.title);
      } else if (payload === "command-palette") {
        setIsCommandPaletteOpen(true);
      }
    }).then((stopListening) => {
      unlisten = stopListening;
    });
    return () => unlisten?.();
  }, [activeDrawing, library.root, selectedFolderPath]);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) {
      return;
    }

    let unlisten: (() => void) | undefined;
    void listen("library-changed", () => {
      void refreshLibrary();
    }).then((stopListening) => {
      unlisten = stopListening;
    });
    return () => unlisten?.();
  }, [refreshLibrary]);

  const activeFolderLabel = selectedFolderPath || "Library root";

  return (
    <main className="app-shell" onContextMenu={(event) => event.preventDefault()} onClick={() => setContextTarget(null)}>
      <aside className="sidebar" aria-label="Library">
        <div className="brand-row">
          <span className="brand-mark">✦</span>
          <span>LocalCanvas</span>
        </div>

        <div className="sidebar-actions">
          <button
            className="button button-primary"
            type="button"
            onClick={() => openDialog("drawing")}
            disabled={!library.root}
          >
            <span>＋</span> New drawing
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Import existing Excalidraw drawing"
            title="Import existing Excalidraw drawing"
            onClick={() => void importExistingDrawing()}
            disabled={!library.root || isCreating}
          >
            ↥
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Create folder"
            title="Create folder"
            onClick={() => openDialog("folder")}
            disabled={!library.root}
          >
            ▣
          </button>
        </div>

        <button
          className="root-switcher"
          type="button"
          onClick={() => void chooseLibraryRoot()}
          disabled={isChoosingRoot}
          title={library.root ?? "Choose a library folder"}
        >
          <span className="root-switcher-icon">⌂</span>
          <span>{library.root ? lastPathSegment(library.root) : "Choose library folder"}</span>
          <span className="root-switcher-chevron">⌄</span>
        </button>

        {library.root ? (
          <>
            <nav className="library-tree" aria-label="Drawing folders">
              <p className="section-label">LIBRARY</p>
              <button
                className={`tree-item tree-folder ${selectedFolderPath === "" ? "is-selected" : ""}`}
                type="button"
                onClick={() => browseFolder("")}
              >
                <span className="tree-icon">⌄</span>
                <span className="tree-label">All drawings</span>
                <span className="tree-count">{library.drawings.length}</span>
              </button>
              {library.folders.map((folder) => (
                <FolderItem
                  folder={folder}
                  key={folder.path}
                  selected={folder.path === selectedFolderPath}
                  onSelect={() => browseFolder(folder.path)}
                  onContextMenu={(event) => openContextMenu(event, { kind: "folder", path: folder.path, label: folder.name })}
                />
              ))}
              <div className="tag-filter" aria-label="Filter by Finder tag">
                <button className={!selectedTag ? "is-selected" : ""} type="button" onClick={() => setSelectedTag(null)}>All tags</button>
                {libraryTags.map((tag) => <button className={selectedTag === tag ? "is-selected" : ""} key={tag} type="button" onClick={() => setSelectedTag(tag)}>#{tag}</button>)}
              </div>
              <div className="tree-drawings">
                {visibleDrawings.map((drawing) => (
                  <DrawingItem
                    drawing={drawing}
                    key={drawing.path}
                    active={drawing.path === activeDrawing?.path}
                    onSelect={() => selectDrawing(drawing)}
                    onContextMenu={(event) => openContextMenu(event, { kind: "drawing", path: drawing.path, label: drawing.title })}
                  />
                ))}
              </div>
            </nav>

            {pinnedDrawings.length > 0 && (
              <section className="recent-section" aria-label="Pinned drawings">
                <p className="section-label">PINNED</p>
                {pinnedDrawings.map((drawing) => (
                  <button
                    className="recent-item"
                    key={drawing.path}
                    type="button"
                    onClick={() => selectDrawing(drawing)}
                    onContextMenu={(event) => openContextMenu(event, { kind: "drawing", path: drawing.path, label: drawing.title })}
                  >
                    <span className="recent-thumbnail" aria-hidden="true">★</span>
                    <span><strong>{drawing.title}</strong><small>{drawing.path}</small></span>
                  </button>
                ))}
              </section>
            )}

            <section className="recent-section" aria-label="Recently opened drawings">
              <p className="section-label">RECENT</p>
              {recentDrawings.length ? (
                recentDrawings.map((drawing) => (
                  <button
                    className="recent-item"
                    key={drawing.path}
                    type="button"
                    onClick={() => selectDrawing(drawing)}
                    onContextMenu={(event) => openContextMenu(event, { kind: "drawing", path: drawing.path, label: drawing.title })}
                  >
                    <span className="recent-thumbnail" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    <span>
                      <strong>{drawing.title}</strong>
                      <small>{formatDate(drawing.modifiedAt)}</small>
                    </span>
                  </button>
                ))
              ) : (
                <p className="sidebar-empty">Your latest drawings will appear here.</p>
              )}
            </section>
          </>
        ) : (
          <div className="sidebar-empty sidebar-empty-library">
            Pick a folder to keep standard <code>.excalidraw</code> files on your Mac.
          </div>
        )}

      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div className="breadcrumb">
            <span>{activeDrawing ? activeFolderLabel : "LocalCanvas"}</span>
            {activeDrawing && <><b>/</b><strong>{activeDrawing.title}</strong></>}
          </div>
          <label className="search-box">
            <span>⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Search drawings"
              aria-label="Search drawing titles and paths"
            />
            <kbd>⌘K</kbd>
          </label>
        </header>

        {error && (
          <div className="error-banner" role="alert">
            <span>!</span>
            <p>{error}</p>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss error">×</button>
          </div>
        )}

        {!library.root ? (
          <Welcome onChoose={() => void chooseLibraryRoot()} isChoosing={isChoosingRoot} />
        ) : activeDrawing ? (
          <Canvas
            key={activeDrawing.path}
            drawingPath={activeDrawing.path}
            drawingTitle={activeDrawing.title}
            onSaveStatus={handleSaveStatus}
            onSaved={handleCanvasSaved}
            portalTargets={library.drawings.filter((drawing) => drawing.path !== activeDrawing.path)}
          />
        ) : library.drawings.length ? (
          <ThumbnailGrid
            drawings={visibleDrawings}
            onSelect={selectDrawing}
            onContextMenu={openContextMenu}
          />
        ) : (
          <LibraryEmpty
            drawingCount={library.drawings.length}
            onNewDrawing={() => openDialog("drawing")}
          />
        )}
      </section>

      {isCommandPaletteOpen && (
        <CommandPalette
          drawings={library.drawings}
          folders={library.folders}
          onOpenDrawing={selectDrawing}
          onOpenFolder={browseFolder}
          onNewDrawing={() => openDialog("drawing")}
          onNewFolder={() => openDialog("folder")}
          onImportDrawing={() => void importExistingDrawing()}
          onClose={() => setIsCommandPaletteOpen(false)}
        />
      )}

      {contextTarget && (
        <div
          className="context-menu"
          role="menu"
          aria-label={`${contextTarget.label} actions`}
          style={{ left: contextTarget.x, top: contextTarget.y }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button type="button" role="menuitem" onClick={() => openEditDialog("rename")}>Rename…</button>
          <button type="button" role="menuitem" onClick={() => openEditDialog("move")}>Move to…</button>
          {contextTarget.kind === "drawing" && <button type="button" role="menuitem" onClick={() => void togglePinnedDrawing()}>{(library.pinnedPaths ?? []).includes(contextTarget.path) ? "Unpin drawing" : "Pin drawing"}</button>}
          {contextTarget.kind === "drawing" && <button type="button" role="menuitem" onClick={() => void openTagDialog()}>Edit Finder tags…</button>}
          <div className="context-menu-separator" />
          <button type="button" role="menuitem" className="context-menu-danger" onClick={() => void deleteContextTarget()}>
            Delete {contextTarget.kind === "drawing" ? "drawing" : "folder"}
          </button>
        </div>
      )}

      {tagTarget && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => !isCreating && setTagTarget(null)}>
          <form className="creation-dialog" onSubmit={saveTags} onMouseDown={(event) => event.stopPropagation()}>
            <p className="dialog-eyebrow">FINDER TAGS</p>
            <h2>Tag {tagTarget.label}</h2>
            <label>
              Tags
              <input autoFocus value={tagInput} onChange={(event) => setTagInput(event.currentTarget.value)} placeholder="Work, Architecture" />
            </label>
            <p className="tag-dialog-help">Separate tags with commas. They appear in Finder too.</p>
            <div className="dialog-actions">
              <button className="button button-secondary" type="button" onClick={() => setTagTarget(null)} disabled={isCreating}>Cancel</button>
              <button className="button button-primary" type="submit" disabled={isCreating}>{isCreating ? "Saving…" : "Save tags"}</button>
            </div>
          </form>
        </div>
      )}

      {editTarget && editAction && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeEditDialog}>
          <form className="creation-dialog" onSubmit={updateItem} onMouseDown={(event) => event.stopPropagation()}>
            <p className="dialog-eyebrow">{editAction === "rename" ? "RENAME" : "MOVE"} {editTarget.kind.toUpperCase()}</p>
            <h2>{editAction === "rename" ? `Rename ${editTarget.label}` : `Move ${editTarget.label}`}</h2>
            {editAction === "rename" ? (
              <label>
                {editTarget.kind === "drawing" ? "Drawing name" : "Folder name"}
                <input autoFocus value={newItemName} onChange={(event) => setNewItemName(event.currentTarget.value)} onFocus={(event) => event.currentTarget.select()} />
              </label>
            ) : (
              <label>
                Destination
                <select value={newItemFolder} onChange={(event) => setNewItemFolder(event.currentTarget.value)}>
                  <option value="">Library root</option>
                  {library.folders
                    .filter((folder) => editTarget.kind !== "folder" || !folder.path.startsWith(`${editTarget.path}/`) && folder.path !== editTarget.path)
                    .map((folder) => <option key={folder.path} value={folder.path}>{folder.path}</option>)}
                </select>
              </label>
            )}
            <div className="dialog-actions">
              <button className="button button-secondary" type="button" onClick={closeEditDialog} disabled={isCreating}>Cancel</button>
              <button className="button button-primary" type="submit" disabled={isCreating}>{isCreating ? "Working…" : editAction === "rename" ? "Rename" : "Move"}</button>
            </div>
          </form>
        </div>
      )}

      {dialogKind && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeDialog}>
          <form className="creation-dialog" onSubmit={createItem} onMouseDown={(event) => event.stopPropagation()}>
            <p className="dialog-eyebrow">{dialogKind === "drawing" ? "NEW DRAWING" : "NEW FOLDER"}</p>
            <h2>{dialogKind === "drawing" ? "Start a new canvas" : "Create a folder"}</h2>
            <label>
              {dialogKind === "drawing" ? "Drawing name" : "Folder name"}
              <input
                autoFocus
                value={newItemName}
                onChange={(event) => setNewItemName(event.currentTarget.value)}
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
            <label>
              Location
              <select
                value={newItemFolder}
                onChange={(event) => setNewItemFolder(event.currentTarget.value)}
              >
                <option value="">Library root</option>
                {library.folders.map((folder) => (
                  <option key={folder.path} value={folder.path}>
                    {folder.path}
                  </option>
                ))}
              </select>
            </label>
            <div className="dialog-actions">
              <button className="button button-secondary" type="button" onClick={closeDialog} disabled={isCreating}>
                Cancel
              </button>
              <button className="button button-primary" type="submit" disabled={isCreating}>
                {isCreating ? "Creating…" : dialogKind === "drawing" ? "Create drawing" : "Create folder"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

function Welcome({ onChoose, isChoosing }: { onChoose: () => void; isChoosing: boolean }) {
  return (
    <div className="welcome-panel">
      <div className="welcome-sparkle">✦</div>
      <p className="dialog-eyebrow">LOCAL-FIRST WHITEBOARD</p>
      <h1>Your canvas belongs on your Mac.</h1>
      <p>
        LocalCanvas stores every sketch as a portable Excalidraw file. No account,
        sync server, or network connection required.
      </p>
      <button className="button button-primary welcome-button" type="button" onClick={onChoose} disabled={isChoosing}>
        {isChoosing ? "Opening Finder…" : "Choose a library folder"}
      </button>
      <small>Choose an existing folder or make a new one in Finder.</small>
    </div>
  );
}

function LibraryEmpty({ drawingCount, onNewDrawing }: { drawingCount: number; onNewDrawing: () => void }) {
  return (
    <div className="library-empty-panel">
      <div className="empty-canvas-icon">▱</div>
      <h1>{drawingCount ? "Choose a drawing" : "Your library is ready"}</h1>
      <p>
        {drawingCount
          ? "Select a canvas from the sidebar to continue sketching."
          : "Create your first blank canvas. It will be saved as a standard .excalidraw file."}
      </p>
      {!drawingCount && <button className="button button-primary" type="button" onClick={onNewDrawing}>Create first drawing</button>}
    </div>
  );
}

function FolderItem({ folder, selected, onSelect, onContextMenu }: {
  folder: FolderSummary;
  selected: boolean;
  onSelect: () => void;
  onContextMenu: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      className={`tree-item tree-folder ${selected ? "is-selected" : ""}`}
      type="button"
      onClick={onSelect}
      onContextMenu={onContextMenu}
      style={{ paddingLeft: `${12 + folderDepth(folder.path) * 12}px` }}
    >
      <span className="tree-icon">›</span>
      <span className="tree-label">{folder.name}</span>
    </button>
  );
}

function DrawingItem({ drawing, active, onSelect, onContextMenu }: {
  drawing: DrawingSummary;
  active: boolean;
  onSelect: () => void;
  onContextMenu: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      className={`tree-item tree-drawing ${active ? "is-active" : ""}`}
      type="button"
      onClick={onSelect}
      onContextMenu={onContextMenu}
      style={{ paddingLeft: `${30 + folderDepth(parentPath(drawing.path)) * 12}px` }}
      title={drawing.path}
    >
      <span className="tree-icon">◇</span>
      <span className="tree-label">{drawing.title}</span>
    </button>
  );
}

function folderDepth(path: string) {
  return path ? path.split("/").length - 1 : 0;
}

function drawingPathsToSummaries(drawings: DrawingSummary[], paths: string[]) {
  const drawingsByPath = new Map(drawings.map((drawing) => [drawing.path, drawing]));
  return paths.flatMap((path) => {
    const drawing = drawingsByPath.get(path);
    return drawing ? [drawing] : [];
  });
}

function parentPath(path: string) {
  const segments = path.split("/");
  segments.pop();
  return segments.join("/");
}

function lastPathSegment(path: string) {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(timestamp);
}

function asMessage(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

export default App;
