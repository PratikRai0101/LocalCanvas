import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Canvas, SaveStatus } from "./canvas/Canvas";
import {
  DrawingSummary,
  FolderSummary,
  LibraryState,
  libraryApi,
} from "./library/api";
import "./App.css";

type DialogKind = "drawing" | "folder" | null;

const EMPTY_LIBRARY: LibraryState = {
  root: null,
  drawings: [],
  folders: [],
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
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");

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

  const visibleDrawings = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return library.drawings.filter((drawing) => {
      const isInSelectedFolder = !selectedFolderPath || drawing.path.startsWith(`${selectedFolderPath}/`);
      const matchesQuery = !normalizedQuery || `${drawing.title} ${drawing.path}`.toLocaleLowerCase().includes(normalizedQuery);
      return isInSelectedFolder && matchesQuery;
    });
  }, [library.drawings, query, selectedFolderPath]);

  const recentDrawings = library.drawings.slice(0, 6);

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

  async function createItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialogKind) {
      return;
    }

    setIsCreating(true);
    try {
      if (dialogKind === "drawing") {
        const drawing = await libraryApi.createDrawing(newItemFolder, newItemName);
        const nextLibrary = await refreshLibrary();
        setActiveDrawing(
          nextLibrary.drawings.find((item) => item.path === drawing.path) ?? drawing,
        );
        setSelectedFolderPath(parentPath(drawing.path));
        setSaveStatus("saved");
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
    setSaveStatus("saved");
    setError(null);
  }

  const activeFolderLabel = selectedFolderPath || "Library root";

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Library">
        <div className="window-controls" aria-hidden="true">
          <span className="traffic-light traffic-light-close" />
          <span className="traffic-light traffic-light-minimize" />
          <span className="traffic-light traffic-light-zoom" />
        </div>

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
                onClick={() => setSelectedFolderPath("")}
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
                  onSelect={() => setSelectedFolderPath(folder.path)}
                />
              ))}
              <div className="tree-drawings">
                {visibleDrawings.map((drawing) => (
                  <DrawingItem
                    drawing={drawing}
                    key={drawing.path}
                    active={drawing.path === activeDrawing?.path}
                    onSelect={() => selectDrawing(drawing)}
                  />
                ))}
              </div>
            </nav>

            <section className="recent-section" aria-label="Recently modified drawings">
              <p className="section-label">RECENT</p>
              {recentDrawings.length ? (
                recentDrawings.map((drawing) => (
                  <button
                    className="recent-item"
                    key={drawing.path}
                    type="button"
                    onClick={() => selectDrawing(drawing)}
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

        <div className="sidebar-footer">
          <button className="graph-button" disabled type="button" title="Graph view is coming next">
            <span>◌</span> Graph view <small>soon</small>
          </button>
          <span className={`save-status save-status-${saveStatus}`}>
            <i />
            {saveStatus === "saving"
              ? "Saving…"
              : saveStatus === "error"
                ? "Save failed"
                : "All changes saved"}
          </span>
        </div>
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
            onSaveStatus={setSaveStatus}
            onSaved={() => void refreshLibrary()}
          />
        ) : (
          <LibraryEmpty
            drawingCount={library.drawings.length}
            onNewDrawing={() => openDialog("drawing")}
          />
        )}
      </section>

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

function FolderItem({ folder, selected, onSelect }: { folder: FolderSummary; selected: boolean; onSelect: () => void }) {
  return (
    <button
      className={`tree-item tree-folder ${selected ? "is-selected" : ""}`}
      type="button"
      onClick={onSelect}
      style={{ paddingLeft: `${12 + folderDepth(folder.path) * 12}px` }}
    >
      <span className="tree-icon">›</span>
      <span className="tree-label">{folder.name}</span>
    </button>
  );
}

function DrawingItem({ drawing, active, onSelect }: { drawing: DrawingSummary; active: boolean; onSelect: () => void }) {
  return (
    <button
      className={`tree-item tree-drawing ${active ? "is-active" : ""}`}
      type="button"
      onClick={onSelect}
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
