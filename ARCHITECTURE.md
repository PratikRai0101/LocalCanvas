# Architecture — LocalCanvas

Companion to `AGENTS.md` and `PRD.md`. This is the detailed system design reference.

## 1. Process model

- Single Tauri app process. Rust core owns: filesystem access, SQLite index, file watching, thumbnail generation, native menu/window management, and the bridge to a local AI inference server (subprocess or HTTP to `localhost`).
- Frontend (React, inside the native WebView) owns: the Excalidraw canvas, the library/sidebar UI, the graph view, the AI panel, and the command palette. It talks to the Rust core exclusively through Tauri `invoke` commands — never direct filesystem access from JS.

## 2. Data model

### 2.1 On-disk drawing files

Each drawing is a standalone `.excalidraw` file, e.g.:

```
~/LocalCanvas/
  Architecture/
    auth-flow.excalidraw
    db-schema.excalidraw
  Personal/
    trip-planning.excalidraw
  .localcanvas/
    index.sqlite         (rebuildable cache — not synced, not committed)
    thumbnails/           (cached PNG thumbnails, keyed by file hash)
```

The `.localcanvas/` folder is entirely derived data. Deleting it and relaunching the app must fully recover functionality by rebuilding from the `.excalidraw` files.

### 2.2 Portal / link element

A link from one drawing to another is a normal Excalidraw element (typically a rectangle or a custom "frame-like" shape) with a `customData` payload:

```json
{
  "type": "rectangle",
  "customData": {
    "localcanvas": {
      "kind": "portal",
      "targetId": "b2f1c9e0-...",
      "targetPath": "Architecture/db-schema.excalidraw"
    }
  }
}
```

`targetId` is a stable UUID assigned when a drawing is first created (stored in that file's own `appState.customData` or a sidecar field), so links survive renames/moves as long as the index can resolve UUID → current path. `targetPath` is a best-effort cached hint, re-resolved by UUID if the path is stale.

Because this lives entirely inside `customData`, a file containing a portal element opens without error in any standard Excalidraw consumer — the link simply renders as an inert shape there.

### 2.3 SQLite index schema (cache only)

```sql
CREATE TABLE drawings (
  id TEXT PRIMARY KEY,        -- stable UUID
  path TEXT NOT NULL,
  title TEXT,
  updated_at INTEGER,
  content_hash TEXT
);
CREATE TABLE links (
  source_id TEXT,
  target_id TEXT,
  FOREIGN KEY(source_id) REFERENCES drawings(id),
  FOREIGN KEY(target_id) REFERENCES drawings(id)
);
CREATE TABLE text_index (
  drawing_id TEXT,
  content TEXT              -- concatenated text-element contents, for full-text search
);
CREATE TABLE tags (
  drawing_id TEXT,
  tag TEXT
);
```

Rebuild path: walk the storage root, parse each `.excalidraw` file, extract portal elements and text elements, upsert rows. This must be idempotent and safe to run at any time (e.g., "Rebuild Index" menu command, or automatically if the index file is missing/corrupt at launch).

## 3. Autosave and crash safety

- Debounced save (e.g., 800ms after last edit).
- Write path: serialize scene → write to `<file>.tmp` → atomic rename over the real file. Never write in place. This guarantees a crash mid-save leaves either the old file intact or the new file intact, never a half-written file.
- Version history (T2-10): on each debounced save, optionally copy the previous version into `.localcanvas/versions/<uuid>/<timestamp>.excalidraw` before overwriting, pruned by a retention policy (e.g., keep last 50 or last 30 days).

## 4. Local AI integration

- The Rust core exposes a command like `ai_generate_diagram(prompt: String) -> Result<String>` that forwards to whatever local inference endpoint the user has configured (default: `http://localhost:11434` for Ollama, or a configurable llama.cpp server URL).
- Default pipeline: prompt → LLM emits Mermaid syntax → `@excalidraw/mermaid-to-excalidraw` (JS, runs in the frontend) converts to Excalidraw elements → inserted as a pending preview layer → user accepts/discards.
- No feature in this path may silently fall back to a remote API. If no local endpoint responds, the AI panel shows "no local model available" and core app functions remain unaffected.

## 5. Graph view

- Built entirely from the `links` table in the index.
- Rendered with `d3-force` in the frontend; nodes = drawings, edges = portal links.
- Clicking a node invokes the same "open drawing" path as the file browser — the graph view is just an alternate navigation surface over the same data, not a separate feature silo.

## 6. Compatibility test suite

`/tests/fixtures/excalidraw/` holds a corpus of real `.excalidraw` files (exported from actual excalidraw.com sessions, covering: plain shapes, freedraw, embedded images, frames, groups, bound arrows, libraries). `npm run test:compat` does, for each fixture:

1. Import into LocalCanvas's scene model.
2. Re-export.
3. Diff the re-exported `elements[]`/`appState` against the original for semantic equivalence (not byte-identical — key ordering, generated timestamps, etc. may differ, but every element's meaningful fields must round-trip).
4. Separately: take a LocalCanvas file containing a portal element and confirm it parses with zero errors using the plain upstream `@excalidraw/excalidraw` import path.

Any change to element schema handling, `customData` usage, or export/import logic must pass this suite before merge.
