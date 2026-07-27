# Product Requirements Document

## LocalCanvas — A Local-First, AI-Enhanced Whiteboard for macOS

**Version:** 1.0
**Author:** Pratik Rai
**Status:** Draft
**Date:** July 27, 2026

---

## 1. Overview

LocalCanvas is a native-feeling macOS whiteboard application built on the open-source Excalidraw canvas engine. It stores every drawing as a plain, portable `.excalidraw` JSON file on the user's local disk, works fully offline, and adds three categories of value on top of stock Excalidraw:

1. **File and library management** — folders, tags, search, thumbnails, versioning for a lifetime of drawings.
2. **Local AI assistance** — text-to-diagram and sketch-to-diagram generation using models already running on the user's machine, with zero data leaving the device.
3. **Cross-drawing linking and graph navigation** — an Obsidian-style graph view that treats each `.excalidraw` file as a node, connected by in-canvas link elements, turning many separate infinite canvases into one navigable knowledge graph.

The app must remain a strict superset of Excalidraw: any file it produces opens correctly in web Excalidraw, the VS Code Excalidraw extension, and Obsidian's Excalidraw plugin, and vice versa.

---

## 2. Goals and Non-Goals

### 2.1 Goals

- Fully offline drawing and file management; no account, no server, no telemetry by default.
- 100% round-trip file compatibility with `.excalidraw`, `.excalidraw.png`, `.excalidraw.svg`, and `.excalidrawlib` formats.
- Native macOS shell: real menu bar, window management, Spotlight-friendly files, keyboard shortcuts matching platform conventions.
- Local-only AI features (text-to-diagram, sketch cleanup) using models the user already runs, with no cloud dependency.
- A graph view that visualizes links between drawings, built from an in-canvas "portal" element rather than external metadata.
- Enhanced canvas features (frames-as-slides presentation mode, layers panel, voice notes, OCR-on-paste) that stock Excalidraw lacks.

### 2.2 Non-Goals (v1)

- Real-time multiplayer collaboration.
- Mobile or iPad app (may be a later phase; not in scope for v1).
- Cloud sync service built by us. (Users may point storage at an iCloud Drive folder themselves.)
- Full native Metal/Core Graphics re-implementation of the canvas renderer. v1 embeds the actual Excalidraw web component in a native WebView shell.
- Training or fine-tuning custom models. v1 only prompts existing local models.

---

## 3. Target User

Primary: the author — a developer who uses whiteboarding constantly for architecture sketches, notes, and thinking, wants full data ownership, and already runs a local LLM inference stack. Secondary: any privacy-conscious knowledge worker who currently uses excalidraw.com but wants local storage, organization, and no browser-tab sprawl.

---

## 4. Architecture Summary

| Layer | Technology | Rationale |
|---|---|---|
| App shell | Tauri 2 (Rust core + native WebView) | Small binary, low idle resource use, native OS integration, matches existing author stack |
| Canvas | `@excalidraw/excalidraw` React component inside the WebView | Full feature parity and file-format compatibility with zero re-implementation risk |
| Shell UI (sidebar, graph view, search, AI panel) | React, rendered in the same WebView alongside the canvas | Single frontend codebase; native-feeling chrome via Tauri's window APIs |
| File storage | Flat filesystem: one `.excalidraw` JSON file per drawing, user-chosen root folder | Finder/Spotlight/git-friendly; no lock-in; no proprietary database |
| Local index | SQLite (via `rusqlite`), rebuilt from source files, never authoritative | Fast search/graph queries without making the DB the source of truth |
| Link graph | Custom Excalidraw element type using the `customData` field, indexed into SQLite | No fork of Excalidraw's core schema required |
| Thumbnails | Generated via `exportToSvg`/`exportToBlob`, cached to disk, invalidated on file mtime change | Fast library grid without re-parsing JSON on every launch |
| Local AI | Calls to user's existing local inference server (llama.cpp / Ollama), never a remote API | Reuses author's existing model roster (OmniCoder-9B, Qwen3.5, etc.) |
| File watching | Rust `notify` crate | Detect external edits (e.g., file edited by VS Code extension) and reload live |

---

## 5. Feature Requirements

### Tier 1 — Core (v1 must-have)

| ID | Requirement | Acceptance Criteria |
|---|---|---|
| T1-1 | Full Excalidraw drawing functionality (shapes, arrows, freedraw, text, images, frames) | Feature parity with excalidraw.com, verified against upstream feature list per release |
| T1-2 | Local folder-based library with nested folders | User can create/rename/move/delete folders; structure mirrors real filesystem paths |
| T1-3 | One `.excalidraw` file per drawing on disk | Files openable directly by any Excalidraw-compatible tool without LocalCanvas running |
| T1-4 | Thumbnail grid view of all drawings | Thumbnails regenerate automatically when a file changes; grid loads in under 500ms for 500 files |
| T1-5 | Full-text search across all drawing text elements and titles | Search returns results across the whole library in under 200ms for 1,000 files |
| T1-6 | Tags/collections independent of folder location | A drawing can carry multiple tags; tag filter combines with folder browsing |
| T1-7 | Autosave with debounce | No explicit "save" step required; data loss window under 2 seconds |
| T1-8 | Round-trip compatibility with `.excalidraw`, `.excalidraw.png`, `.excalidraw.svg` | A file exported from LocalCanvas opens correctly in excalidraw.com and vice versa, verified by automated test fixtures |
| T1-9 | Native macOS app shell (menu bar, window chrome, `.app`/`.dmg` packaging) | Passes macOS Gatekeeper notarization; standard Cmd+key shortcuts work |
| T1-10 | Recent files and pinned/favorites | Sidebar section always shows last 10 opened drawings |

### Tier 2 — Power User / Differentiators

| ID | Requirement | Acceptance Criteria |
|---|---|---|
| T2-1 | **Graph view**: force-directed graph of all drawings, nodes = files, edges = in-canvas link elements | Clicking a node opens that drawing; graph updates live as links are added/removed |
| T2-2 | **Canvas-to-canvas portal element**: a custom Excalidraw element type that links to another `.excalidraw` file by stable ID | Double-clicking a portal element navigates into the linked drawing; backlinks are discoverable |
| T2-3 | **Backlinks panel**: per-drawing list of all other drawings linking to it | Panel updates within 1 second of a new link being created elsewhere in the library |
| T2-4 | **Local text-to-diagram AI**: prompt describes a diagram, local LLM emits Mermaid or Excalidraw JSON, inserted onto canvas | Works fully offline against a locally running model; user can undo the insertion as one action |
| T2-5 | **Sketch cleanup AI**: given a rough freedraw sketch, suggest a "tidied" version using straight shapes | Suggestion appears as a preview overlay; user accepts or discards, original strokes are never destructively modified until accepted |
| T2-6 | **Presentation mode**: sequential slideshow through a canvas's frames | Arrow keys advance/retreat; Escape exits to normal canvas view |
| T2-7 ✅ | **Layers panel**: explicit list of z-ordered groups/elements with visibility toggles | Matches or exceeds Figma-style layer list ergonomics |
| T2-8 | **Voice notes pinned to canvas locations** | Records via local mic, transcribes locally (faster-whisper), text is searchable |
| T2-9 | **OCR-on-paste** for pasted screenshots/images | Extracted text becomes searchable metadata on the image element |
| T2-10 ✅ | **Version history timeline scrubber** | User can scrub back through autosaved snapshots and restore any prior version non-destructively |
| T2-11 | **Command palette (Cmd+K)** | Fuzzy-jumps to any drawing, folder, or tag; runs common actions (new drawing, export, toggle graph view) |
| T2-12 | **Git-friendly pretty-printed JSON option** | Optional setting that reformats saved JSON for meaningful line-level git diffs |

### Tier 3 — Later Phases

| ID | Requirement |
|---|---|
| T3-1 | Optional iCloud Drive storage root for multi-Mac sync (no custom sync engine) |
| T3-2 | Optional git-backed auto-commit version history with browsable diff view |
| T3-3 | Encrypted zip backup/export |
| T3-4 | Custom Excalidraw shape libraries (`.excalidrawlib`) management UI |
| T3-5 | Menu bar quick-capture icon for instant new sketch |
| T3-6 | Plugin/scripting hook system run on save |
| T3-7 | iPad/Sidecar pressure-sensitive input support |
| T3-8 | Content-addressed drawing history with optional on-chain hash anchoring for timestamp/IP-provenance proof |

---

## 6. File Format Compatibility Details

- `.excalidraw`: JSON containing `type`, `version`, `source`, `elements[]`, `appState`, `files{}` (base64-encoded binary assets keyed by fileId). LocalCanvas must read and write this schema unmodified for full elements/appState; custom data (e.g., portal links) lives exclusively inside each element's `customData` field, which upstream Excalidraw already ignores gracefully, guaranteeing forward and backward compatibility.
- `.excalidraw.png` / `.excalidraw.svg`: standard image files with the scene JSON embedded in metadata (PNG `tEXt` chunk keyed `excalidraw`, SVG embedded as a comment). LocalCanvas uses `@excalidraw/excalidraw`'s own `exportToBlob`/`exportToSvg` functions for this, not a custom implementation, to guarantee compatibility with the upstream import path.
- `.excalidrawlib`: JSON array of reusable library items, same compatibility approach.

---

## 7. Local AI Design

- No remote API calls for AI features under any default configuration. A settings toggle may allow opting into a remote model later, but it is off by default and never required for core functionality.
- Text-to-diagram: LLM is prompted with the Excalidraw element schema and few-shot examples, or asked to emit Mermaid syntax which is then converted via the `@excalidraw/mermaid-to-excalidraw` library — the latter is the default path since it is a far more reliable target for an LLM than raw coordinate JSON.
- Sketch-vision features (if a vision-capable local model is available) are additive and must degrade gracefully to "unavailable" rather than blocking core app function when no suitable local model is detected.
- All AI actions are single undoable operations and never auto-apply without a preview step.

---

## 8. Success Metrics

- Cold launch time under 1 second on the author's reference hardware (Apple Silicon Mac).
- Zero data loss incidents across autosave/version history in daily use.
- 100% pass rate on a compatibility test suite that round-trips a corpus of real-world `.excalidraw` files through LocalCanvas and back.
- Graph view remains usable (interactive frame rate) at up to 1,000 linked drawings.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Excalidraw upstream package changes break embedding | Pin exact version, add CI check against new releases before upgrading |
| WebView-hosted canvas feels non-native | Keep all chrome (menus, sidebar, window controls) genuinely native; only the canvas itself is web-rendered |
| Local AI models too weak for reliable diagram generation | Default to Mermaid-intermediate path, which is far more forgiving of model quality than raw coordinate JSON |
| SQLite index and filesystem source of truth drift out of sync | Index is always rebuildable from files; treat it as a cache, never authoritative, with a "rebuild index" command |
| Custom portal element breaks upstream Excalidraw rendering | Store link data exclusively in the standards-compliant `customData` field; verify a portal-containing file opens with zero errors in stock excalidraw.com |

---

## 10. Open Questions

- Should the graph view support grouping/clustering by tag or folder, or remain a flat link graph?
- Should version history be its own SQLite-tracked snapshot system, or shell out to git for T3-2 from the start?
- What is the minimum viable local model size/quality bar before text-to-diagram is considered "reliable enough" to ship?
