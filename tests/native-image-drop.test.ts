import { describe, expect, it } from "vitest";
import { clientPositionInCanvas, isSupportedImagePath } from "../src/canvas/nativeImageDrop";

describe("native image drops", () => {
  it("uses WKWebView's native logical drop position as the canvas client position", () => {
    const position = clientPositionInCanvas(
      { x: 800, y: 520 },
      { x: 0, y: 56 },
      2,
      { left: 150, top: 80, right: 900, bottom: 600 },
    );

    expect(position).toEqual({ x: 800, y: 520 });
  });

  it("accepts image paths that Tauri reports without a browser MIME type", () => {
    expect(isSupportedImagePath("/private/tmp/Screenshot 2026-07-27 at 10.01.49 PM.png")).toBe(true);
    expect(isSupportedImagePath("/tmp/notes.excalidraw")).toBe(false);
  });
});
