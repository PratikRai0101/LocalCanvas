# AGENTS.md — LocalCanvas

This file orients any coding agent (Claude Code, Cursor, Aider, etc.) working in this repo. Read this before making changes. See `docs/PRD.md` for full product context and `docs/ARCHITECTURE.md` for system design detail.

## What this project is

LocalCanvas is a local-first macOS whiteboard app. Tauri 2 (Rust core) + React frontend embedding `@excalidraw/excalidraw`. Every drawing is a plain `.excalidraw` JSON file on disk — the filesystem is the source of truth, not any database.

## Non-negotiable invariants

These constraints override convenience or "cleaner code" instincts. Do not violate them even if a refactor seems to call for it:

1. **File format compatibility is sacred.** Any `.excalidraw`, `.excalidraw.png`, `.excalidraw.svg`, or `.excalidrawlib` file this app writes MUST open correctly in unmodified web Excalidraw and vice versa. Never modify the core `elements[]` / `appState` schema. Never add custom top-level keys to the scene JSON — all custom metadata (portal links, etc.) goes inside an individual element's `customData` field, which upstream Excalidraw ignores gracefully.
2. **The filesystem is the source of truth. The SQLite index is a cache, always rebuildable, never authoritative.** If code ever treats the index as the only place data lives, that's a bug. There must always be a "rebuild index from disk" path that fully recovers from an empty/corrupt index.
3. **No network calls for core features.** Drawing, saving, file management, search, and the AI features must all work with network access fully disabled. If you add a feature that needs the network, it must be opt-in and clearly gated, and the app must degrade gracefully (not crash, not block) when it's unavailable.
4. **AI actions are never silently destructive.** Every AI-generated change (text-to-diagram insertion, sketch cleanup) must be a single undoable operation and must never auto-apply without the user accepting a preview.
5. **Don't fork the Excalidraw core rendering engine.** Use the upstream `@excalidraw/excalidraw` package's public API (props, imperative API via `excalidrawAPI`, `customData`, scene import/export functions). If a feature seems to require patching Excalidraw internals, stop and flag it — that's an architecture decision, not a quick fix.

## Repo layout

```
/src                    React frontend (shell UI + Excalidraw embed)
  /canvas                Excalidraw wrapper component, portal element logic
  /library               File browser, folder tree, thumbnail grid, tags
  /graph                 Force-directed graph view (d3-force)
  /ai                     Text-to-diagram, sketch cleanup — calls local inference server
  /search                 Search UI, command palette
/src-tauri               Rust core
  /src/index             SQLite index build/rebuild, file watcher (notify crate)
  /src/fs                 File read/write, thumbnail cache, autosave debounce
  /src/commands           Tauri commands exposed to the frontend
/docs
  PRD.md
  ARCHITECTURE.md
  DECISIONS.md            Architecture Decision Records
/tests
  /fixtures/excalidraw    Real-world .excalidraw files used for compatibility round-trip tests
```

## Build & test commands

```bash
npm install
npm run tauri dev        # local dev with hot reload
npm run tauri build      # produces .app / .dmg
npm run test             # frontend unit tests (vitest)
cargo test --manifest-path src-tauri/Cargo.toml   # Rust core tests
npm run test:compat      # compatibility round-trip suite against /tests/fixtures
```

Run `npm run test:compat` after any change touching scene serialization, element schema, or export/import logic. This is the test suite that guards invariant #1 — treat a failure here as a blocker, not a warning.

## Code style

- Rust: standard `rustfmt` / `clippy` clean, no warnings suppressed without a comment explaining why.
- TypeScript: strict mode on. No `any` without a comment justifying it.
- Prefer small, composable Tauri commands over one large "do everything" command — keeps the Rust/JS boundary auditable.
- New custom Excalidraw element behavior (like the portal element) should be implemented as a thin layer on top of `customData`, not by forking element types in the upstream package.

## Where to be careful

- `src-tauri/src/index/` — this is the SQLite index/graph builder. Changes here have to preserve "always rebuildable from disk" — never add a write path that only updates the index without a corresponding source-of-truth file write.
- `src/canvas/portal-element.ts` — the custom link element. Any change here should be immediately checked against `npm run test:compat` since this is the highest-risk spot for breaking upstream compatibility.
- `src/ai/` — must never make a network call by default. If you're adding a feature here, check it against invariant #3 and #4 above before writing code.

## Definition of done for a feature

1. Matches an ID in `docs/PRD.md` (Tier 1/2/3 requirement), or is logged as a new item there first.
2. Has a test (unit and/or compat suite, as appropriate).
3. Does not regress `npm run test:compat`.
4. If it touches file writes, works correctly with the app force-quit mid-write (no corrupted files) — the autosave path must be crash-safe (write to temp file, then atomic rename).
5. Recorded in `docs/DECISIONS.md` if it involved a non-obvious architectural choice.
