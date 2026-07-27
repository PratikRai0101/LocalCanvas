import { describe, expect, it } from "vitest";
import { clientPositionInCanvas, isSupportedImagePath } from "../src/canvas/nativeImageDrop";

describe("native image drops", () => {
  it("converts a native physical drop position into a canvas client position", () => {
    const position = clientPositionInCanvas(
      { x: 800, y: 520 },
      { x: 0, y: 56 },
      2,
      { left: 150, top: 80, right: 900, bottom: 600 },
    );

    expect(position).toEqual({ x: 400, y: 232 });
  });

  it("accepts image paths that Tauri reports without a browser MIME type", () => {
    expect(isSupportedImagePath("/private/tmp/Screenshot 2026-07-27 at 10.01.49 PM.png")).toBe(true);
    expect(isSupportedImagePath("/tmp/notes.excalidraw")).toBe(false);
  });
});
