# CLAUDE.md

This project's agent instructions live in `AGENTS.md` at the repo root — read that first.

Additional context specific to Claude Code sessions:

- Full product spec: `docs/PRD.md`
- System design: `docs/ARCHITECTURE.md`
- Decision history: `docs/DECISIONS.md` — check this before revisiting a past architectural choice, and add an entry when you make a new non-obvious one.
- Compatibility test fixtures live in `/tests/fixtures/excalidraw/` — never delete or "clean up" these without explicit confirmation, they are the ground truth for format compatibility.

When starting a new session in this repo, run `npm run test:compat` once to confirm the baseline is green before making changes, so any failure introduced during the session is clearly attributable.
