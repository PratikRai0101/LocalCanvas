# Architecture Decision Records — LocalCanvas

Short-form log of non-obvious decisions and why they were made. Add a new entry (don't edit old ones) whenever a coding agent or contributor makes a call that a future agent might otherwise second-guess or accidentally reverse.

Format:

```
## ADR-NNN: Title
Date:
Status: Accepted | Superseded by ADR-XXX
Context:
Decision:
Consequences:
```

---

## ADR-001: Embed upstream Excalidraw via WebView rather than reimplementing the canvas natively

Date: 2026-07-27
Status: Accepted
Context: A fully native Swift/SwiftUI or Rust/Metal canvas would require reimplementing Excalidraw's element model, rough.js-style rendering, arrow binding, and text editing — multiple months of work with high risk of subtle incompatibility with the `.excalidraw` format.
Decision: Use Tauri 2's native WebView to host the real `@excalidraw/excalidraw` React component for the canvas itself. Everything else (window chrome, menus, sidebar, file management, graph view) is built as native-feeling UI around it.
Consequences: Guarantees 100% format and feature compatibility with zero re-implementation risk. Canvas interactions run in a WebView rather than truly native rendering — acceptable tradeoff given the compatibility requirement is a hard product goal (see PRD non-negotiables).

## ADR-002: Store portal/link data in `customData`, not a new top-level schema field

Date: 2026-07-27
Status: Accepted
Context: Need a way to link one drawing to another from within the canvas, without breaking the ability for any `.excalidraw` file to open in unmodified upstream Excalidraw.
Decision: Store all LocalCanvas-specific metadata (portal links, stable drawing UUID) inside the `customData` field of individual elements / appState, which upstream Excalidraw already passes through without validation or error.
Consequences: Files remain fully compatible with any Excalidraw consumer. The tradeoff is that link data is somewhat "hidden" inside element internals rather than a first-class file-level field — mitigated by the SQLite index, which surfaces it as first-class UI (graph view, backlinks panel).

## ADR-003: SQLite index is a rebuildable cache, filesystem is sole source of truth

Date: 2026-07-27
Status: Accepted
Context: Wanted fast search/graph queries without risking the failure mode where a database becomes the only place data lives (common bug class in note-taking apps — index corruption causing data loss).
Decision: The `.excalidraw` files on disk are always authoritative. SQLite index must be fully reconstructable by walking the storage folder from empty. No feature may depend on data that exists only in the index.
Consequences: Slightly more engineering work (must maintain a real "rebuild from scratch" path as a first-class, tested feature) but eliminates an entire class of data-loss bugs.

## ADR-004: Default AI pipeline goes through Mermaid, not direct Excalidraw JSON generation

Date: 2026-07-27
Status: Accepted
Context: Local LLMs (the author's existing model roster) are more reliable at generating well-known structured text formats like Mermaid than at emitting precise coordinate-based JSON for arbitrary diagram layouts.
Decision: Text-to-diagram default path is LLM → Mermaid syntax → `@excalidraw/mermaid-to-excalidraw` conversion → canvas elements, rather than prompting the LLM to emit Excalidraw's element schema directly.
Consequences: Higher reliability with weaker/smaller local models. Slightly less layout flexibility than direct JSON generation would theoretically allow — acceptable since a "generate raw JSON" path can be added later as an advanced option without breaking the default.

## ADR-005: Use path-derived keys only inside the rebuildable search index until portal IDs ship

Date: 2026-07-27
Status: Accepted
Context: Full-text search needs an index before the portal feature introduces durable drawing UUIDs. Persisting a UUID only in SQLite or a sidecar would violate the rule that the index is fully rebuildable from drawing files.
Decision: The search-only SQLite index derives its internal `drawings.id` from the drawing's current relative path. It is a cache key only, never exposed as a durable drawing identity and never used for portal links. The portal slice must introduce a durable source-of-truth UUID in element `customData` before writing `links` rows.
Consequences: Search remains correct after a rename because the index is rebuilt from disk, while backlinks and portal navigation deliberately remain unavailable until durable IDs exist. No identity metadata is added to scene-level JSON.

## ADR-006: Store a drawing UUID in a transparent, locked Excalidraw metadata element

Date: 2026-07-27
Status: Accepted
Context: Portals need a durable target identity that survives file moves and lets the rebuildable index resolve IDs to current paths. A SQLite-only ID or sidecar would violate the filesystem-source-of-truth invariant, while custom scene-level fields violate format compatibility requirements. Deleted elements are discarded by Excalidraw's restore path, so cannot carry this metadata.
Decision: On first open, add a normal zero-opacity, locked Excalidraw rectangle whose `customData.localcanvas` payload has `kind: "drawing-metadata"` and a UUID. It is invisible in compatible Excalidraw consumers and survives their standard serialize/restore path.
Consequences: Opening a legacy drawing performs one atomic migration write. The ID stays in the portable drawing file, so the SQLite index can always be rebuilt and links can survive renames and moves. The marker is an implementation detail and must never be exposed as a user-facing canvas element.

## ADR-007: Keep version snapshots as bounded, non-authoritative local history

Date: 2026-07-27
Status: Accepted
Context: Autosave needs recoverable history, but a history system must never replace the portable `.excalidraw` file as the source of truth or grow indefinitely.
Decision: Before an autosave replaces changed scene contents, atomically copy the prior scene to `.localcanvas/versions/<drawing-id>/`. Keep the newest 50 snapshots per drawing. Restoring a snapshot uses the normal save path, so the current scene becomes a new snapshot first. A path-hash directory temporarily preserves snapshots for drawings created before durable metadata exists.
Consequences: A restored drawing never destroys the current state, history remains local and bounded, and moves/renames preserve history once the drawing UUID metadata is present. Version snapshots are convenience recovery data, not a required input for opening the current drawing.
