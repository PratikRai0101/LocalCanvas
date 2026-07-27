import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import type { DrawingSummary, FolderSummary } from "../library/api";

type CommandPaletteProps = {
  drawings: DrawingSummary[];
  folders: FolderSummary[];
  onOpenDrawing: (drawing: DrawingSummary) => void;
  onOpenFolder: (path: string) => void;
  onNewDrawing: () => void;
  onNewFolder: () => void;
  onImportDrawing: () => void;
  onClose: () => void;
};

type PaletteItem = {
  id: string;
  label: string;
  detail: string;
  run: () => void;
};

export function CommandPalette({
  drawings,
  folders,
  onOpenDrawing,
  onOpenFolder,
  onNewDrawing,
  onNewFolder,
  onImportDrawing,
  onClose,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const items = useMemo<PaletteItem[]>(() => {
    const needle = query.trim().toLowerCase();
    const actions: PaletteItem[] = [
      { id: "new-drawing", label: "New drawing", detail: "⌘N", run: onNewDrawing },
      { id: "new-folder", label: "New folder", detail: "⌘⇧N", run: onNewFolder },
      { id: "import", label: "Import Excalidraw drawing", detail: "⌘O", run: onImportDrawing },
    ];
    const drawingItems = drawings.map((drawing) => ({
      id: `drawing:${drawing.path}`,
      label: drawing.title,
      detail: drawing.path,
      run: () => onOpenDrawing(drawing),
    }));
    const folderItems = folders.map((folder) => ({
      id: `folder:${folder.path}`,
      label: folder.name,
      detail: folder.path,
      run: () => onOpenFolder(folder.path),
    }));
    return [...actions, ...drawingItems, ...folderItems].filter((item) =>
      !needle || `${item.label} ${item.detail}`.toLowerCase().includes(needle),
    );
  }, [drawings, folders, onImportDrawing, onNewDrawing, onNewFolder, onOpenDrawing, onOpenFolder, query]);

  useEffect(() => setSelectedIndex(0), [query]);

  function choose(item: PaletteItem) {
    item.run();
    onClose();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((index) => Math.min(index + 1, items.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && items[selectedIndex]) {
      event.preventDefault();
      choose(items[selectedIndex]);
    }
  }

  return (
    <div className="command-palette-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(event) => event.stopPropagation()}>
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search drawings, folders, and actions"
          aria-label="Search commands"
        />
        <div className="command-palette-list" role="listbox">
          {items.length ? items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              className={index === selectedIndex ? "is-selected" : ""}
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={() => choose(item)}
            >
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </button>
          )) : <p>No matching drawings, folders, or commands.</p>}
        </div>
      </section>
    </div>
  );
}
