# LocalCanvas

A local-first macOS whiteboard built with Tauri 2, React, and the upstream
`@excalidraw/excalidraw` component.

## What works in this foundation

- Native folder chooser for a library root.
- Nested folders and one portable `.excalidraw` file per drawing.
- Full upstream Excalidraw editor embedded in the desktop shell.
- 800 ms debounced autosave through Rust only; every write is temp-file +
  `fsync` + atomic rename.
- The frontend never accesses the filesystem directly.
- An upstream serialization compatibility test, including an element carrying
  LocalCanvas portal metadata in `customData`.

The file system is authoritative. The `.localcanvas/` folder is created as the
home for derived data but is not used as a source of drawing data.

## Develop

```bash
npm install
npm run tauri dev
```

## Build a Spotlight-enabled macOS app

Direct Spotlight actions require macOS 26 and the bundled App Intents extension.
Build the distributable `.app` with:

```bash
npm run build:macos
```

The command produces `src-tauri/target/release/bundle/macos/LocalCanvas.app`.
Set `APPLE_SIGNING_IDENTITY` to a Developer ID identity when preparing a signed
release; local builds use ad-hoc signing.

## Verify

```bash
npm run build
npm run test
npm run test:compat
cargo test --manifest-path src-tauri/Cargo.toml
```

## Current delivery boundary

This is the Tier 1 storage/canvas foundation. The next slices are the
rebuildable SQLite index (full-text search, tags, thumbnail cache), file
watching, then portal creation/backlinks/graph navigation. See `PRD.md` and
`ARCHITECTURE.md` for the complete plan and non-negotiable invariants.
