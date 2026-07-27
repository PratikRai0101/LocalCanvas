# AI Design Mockup Prompt — LocalCanvas

Use this with a UI-focused generator (v0.dev, Galileo AI, Uizard, Figma AI, or an image model like Midjourney/DALL-E for mood-board-style mockups). It's written to work either as a single combined prompt or split into the per-screen prompts below if your tool does better with narrower asks.

---

## Full combined prompt

```
Design a native macOS desktop app called "LocalCanvas" — a local-first whiteboard
app built on Excalidraw's hand-drawn sketch aesthetic. The UI chrome around the
canvas should feel like a cross between Obsidian (file sidebar, graph view) and
Linear (clean typography, generous whitespace, subtle borders instead of heavy
shadows). The canvas area itself should look like Excalidraw: white/light-gray
background, hand-drawn "sketchy" rectangles, arrows, and text in the
Virgil/Excalifont handwriting-style font.

Layout for the main window:
- Left sidebar (240px), native macOS traffic-light window controls at top left.
  Sidebar contains: a folder tree (nested folders with disclosure triangles),
  a "Tags" section below it with colored pill labels, a "Recent" section with
  small thumbnail previews, and a bottom-pinned toggle to switch the whole
  sidebar into "Graph View" mode.
- Main canvas area takes the rest of the window: an Excalidraw-style infinite
  canvas showing a few example sketched rectangles, one hand-drawn arrow
  connecting two shapes, and a small dashed-border "portal" shape with a subtle
  link icon in its corner (representing a link to another drawing) — the
  portal shape should look intentionally distinct from a normal rectangle,
  maybe with a subtle glow or dashed purple border.
- Top toolbar floating over the canvas, matching Excalidraw's existing
  rounded-pill floating toolbar style: selection tool, rectangle, arrow, text,
  freedraw, plus one new icon for "AI generate" (sparkle icon) and one for
  "voice note" (microphone icon).
- Bottom-right corner: a small floating thumbnail-strip / minimap.

Color palette: neutral off-white canvas (#fefefe), sidebar in a very slightly
darker warm gray (#f7f6f4), dark mode variant should use near-black
(#1e1e1e) with the same warm-neutral undertone Excalidraw uses, not pure black.
Accent color: a soft violet/purple (#6965db, matching Excalidraw's own accent)
used sparingly for the active tool, links, and the AI features.

Typography: UI chrome in a clean geometric sans (Inter or SF Pro), canvas
text/labels in the hand-drawn Excalifont/Virgil style to match real Excalidraw
output.

Style reference: Linear's information density and border treatment, Obsidian's
sidebar/graph-view concept, Excalidraw's actual canvas rendering style
(sketchy/hand-drawn shapes, not sharp vector shapes). This should look like a
polished native macOS productivity app, not a web app — respect standard
macOS window chrome, spacing, and control style throughout.

Deliver: a single high-fidelity desktop app screenshot mockup of the main
window in light mode.
```

---

## Split prompts (use if your tool works better screen-by-screen)

### 1. Main canvas + sidebar (primary screen)
Use the full prompt above as-is — it's written for this screen.

### 2. Graph view screen
```
Same LocalCanvas macOS app, same sidebar and window chrome as before, but the
main content area now shows a force-directed graph view instead of the canvas:
circular nodes (each a small thumbnail of a sketch) connected by thin curved
lines representing links between drawings. A handful of nodes cluster together
more densely (representing a folder of related drawings), with a couple of
isolated outlier nodes. Hovering/selected node has a soft violet glow and shows
its title in a small label beneath it. Keep the same color palette, typography,
and native macOS window chrome as the main canvas screen.
```

### 3. Library / thumbnail grid screen
```
Same LocalCanvas macOS app, same sidebar. Main content area shows a grid of
drawing thumbnails (4 columns), each thumbnail rendered in the hand-drawn
Excalidraw sketch style at small scale, with a filename label and small
tag pills beneath each thumbnail. Top of the content area has a search bar
and a command-palette-style "Cmd+K" hint on the right side. Same color
palette and native macOS window chrome as the other screens.
```

### 4. AI generate panel (overlay)
```
Same LocalCanvas macOS app, canvas screen as the base, but with a small
floating side panel open on the right (320px wide, rounded corners, subtle
drop shadow, matching Linear's panel style): a text input at the top labeled
"Describe a diagram...", below it a preview of a generated flowchart in the
Excalidraw hand-drawn style, and two buttons at the bottom: "Insert" (violet,
primary) and "Discard" (neutral, secondary). A small label reads "Generated
locally — Qwen3.5" in muted gray text to signal on-device processing.
```

---

## Notes for whichever tool you use

- If using an image model (Midjourney/DALL-E) rather than a UI-specific tool, append: `UI mockup, desktop app screenshot, high fidelity, clean vector style for chrome elements, --ar 16:9` (or the equivalent aspect-ratio flag for your tool).
- If using a UI-generation tool that outputs actual code (v0.dev, etc.), you can drop the "Style reference" paragraph and instead paste in the actual constraints from `docs/ARCHITECTURE.md` and `AGENTS.md` for tighter fidelity — those tools tend to do better with concrete component/layout specs than mood language.
- Keep the "portal element" and "generated locally" details in every AI-image-generator pass — they're the two most product-differentiating visual details (cross-canvas linking, on-device AI) and easy for a generic prompt to lose.
