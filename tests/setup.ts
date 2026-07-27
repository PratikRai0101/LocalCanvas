// Excalidraw feature-detects CanvasRenderingContext2D at module load. The
// compatibility suite only imports/serializes scenes; it never renders one.
Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  value: () => ({ filter: "", measureText: (text: string) => ({ width: text.length * 10 }) }),
});

class TestFontFace {
  family: string;
  unicodeRange = "U+0000-FFFF";

  constructor(family: string) {
    this.family = family;
  }
}

Object.defineProperty(globalThis, "FontFace", {
  configurable: true,
  value: TestFontFace,
});

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
});
