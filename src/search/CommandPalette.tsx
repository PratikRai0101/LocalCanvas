import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { DrawingSummary, FolderSummary } from "../library/api";

type CommandPaletteProps = {
  drawings: DrawingSummary[];
  folders: FolderSummary[];
  tags: string[];
  isGraphOpen: boolean;
  onOpenDrawing: (drawing: DrawingSummary) => void;
  onOpenFolder: (path: string) => void;
  onOpenTag: (tag: string) => void;
  onOpenGraph: () => void;
  onCloseGraph: () => void;
  onShowAllDrawings: () => void;
  onNewDrawing: () => void;
  onNewFolder: () => void;
  onImportDrawing: () => void;
  onClose: () => void;
};

type PaletteGroup = "Actions" | "Drawings" | "Folders" | "Tags";
type PaletteItem = {
  id: string;
  group: PaletteGroup;
  label: string;
  detail: string;
  keywords?: string;
  run: () => void;
};

const GROUP_ORDER: PaletteGroup[] = ["Actions", "Drawings", "Folders", "Tags"];

export function CommandPalette({
  drawings,
  folders,
  tags,
  isGraphOpen,
  onOpenDrawing,
  onOpenFolder,
  onOpenTag,
  onOpenGraph,
  onCloseGraph,
  onShowAllDrawings,
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
    const actions: PaletteItem[] = [
      { id: "new-drawing", group: "Actions", label: "New drawing", detail: "⌘N", keywords: "create canvas", run: onNewDrawing },
      { id: "new-folder", group: "Actions", label: "New folder", detail: "⌘⇧N", keywords: "create directory", run: onNewFolder },
      { id: "import", group: "Actions", label: "Import Excalidraw drawing", detail: "⌘O", keywords: "open file", run: onImportDrawing },
      {
        id: "graph",
        group: "Actions",
        label: isGraphOpen ? "Back to library" : "Open graph",
        detail: "Graph",
        keywords: "connections links obsidian network",
        run: isGraphOpen ? onCloseGraph : onOpenGraph,
      },
      { id: "all-drawings", group: "Actions", label: "Show all drawings", detail: "Library", keywords: "clear filters", run: onShowAllDrawings },
    ];
    const drawingItems = drawings.map((drawing) => ({
      id: `drawing:${drawing.path}`,
      group: "Drawings" as const,
      label: drawing.title,
      detail: drawing.path,
      keywords: drawing.tags.join(" "),
      run: () => onOpenDrawing(drawing),
    }));
    const folderItems = folders.map((folder) => ({
      id: `folder:${folder.path}`,
      group: "Folders" as const,
      label: folder.name,
      detail: folder.path,
      run: () => onOpenFolder(folder.path),
    }));
    const tagItems = tags.map((tag) => ({
      id: `tag:${tag}`,
      group: "Tags" as const,
      label: `#${tag}`,
      detail: "Filter drawings",
      keywords: `tag ${tag}`,
      run: () => onOpenTag(tag),
    }));
    return rankItems([...actions, ...drawingItems, ...folderItems, ...tagItems], query);
  }, [drawings, folders, isGraphOpen, onCloseGraph, onImportDrawing, onNewDrawing, onNewFolder, onOpenDrawing, onOpenFolder, onOpenGraph, onOpenTag, onShowAllDrawings, query, tags]);

  useEffect(() => setSelectedIndex(0), [query]);
  useEffect(() => {
    setSelectedIndex((current) => Math.min(current, Math.max(items.length - 1, 0)));
  }, [items.length]);

  const groupedItems = useMemo(() => GROUP_ORDER.map((group) => ({
    group,
    items: items.filter((item) => item.group === group),
  })).filter(({ items }) => items.length), [items]);

  function choose(item: PaletteItem) {
    item.run();
    onClose();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (!items.length) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((index) => Math.min(index + 1, items.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Home") {
      event.preventDefault();
      setSelectedIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setSelectedIndex(items.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(items[selectedIndex]);
    }
  }

  return (
    <div className="command-palette-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(event) => event.stopPropagation()}>
        <div className="command-palette-input">
          <span aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search commands, drawings, folders, and tags"
            aria-label="Search commands"
            aria-controls="command-palette-results"
            aria-activedescendant={items[selectedIndex] ? `command:${items[selectedIndex].id}` : undefined}
          />
          <kbd>esc</kbd>
        </div>
        <div className="command-palette-list" id="command-palette-results" role="listbox">
          {groupedItems.length ? groupedItems.map(({ group, items: groupItems }) => (
            <section className="command-palette-group" key={group} aria-label={group}>
              <p>{group}</p>
              {groupItems.map((item) => {
                const index = items.indexOf(item);
                return (
                  <button
                    id={`command:${item.id}`}
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
                );
              })}
            </section>
          )) : <p className="command-palette-empty">No matching commands, drawings, folders, or tags.</p>}
        </div>
        <footer className="command-palette-footer"><span>↑↓ Navigate</span><span>↵ Open</span><span>Esc Close</span></footer>
      </section>
    </div>
  );
}

function rankItems(items: PaletteItem[], query: string) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) {
    return items;
  }
  return items
    .map((item) => {
      const labelScore = fuzzyScore(needle, item.label);
      const detailScore = fuzzyScore(needle, `${item.detail} ${item.keywords ?? ""}`);
      const score = labelScore === null
        ? detailScore
        : detailScore === null
          ? labelScore
          : Math.max(labelScore, detailScore);
      return { item, score };
    })
    .filter((result): result is { item: PaletteItem; score: number } => result.score !== null)
    .sort((left, right) => right.score - left.score || left.item.label.localeCompare(right.item.label))
    .map(({ item }) => item);
}

function fuzzyScore(needle: string, haystack: string): number | null {
  const value = haystack.toLocaleLowerCase();
  const substringIndex = value.indexOf(needle);
  if (substringIndex >= 0) {
    return 1_000 - substringIndex * 2 - value.length / 100;
  }

  let score = 0;
  let previousIndex = -1;
  for (const character of needle) {
    const index = value.indexOf(character, previousIndex + 1);
    if (index < 0) {
      return null;
    }
    if (index === 0 || /[\s/_-]/.test(value[index - 1])) {
      score += 14;
    }
    if (index === previousIndex + 1) {
      score += 9;
    }
    score -= Math.max(0, index - previousIndex - 1);
    previousIndex = index;
  }
  return score;
}
