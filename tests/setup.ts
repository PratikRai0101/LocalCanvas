// Excalidraw feature-detects CanvasRenderingContext2D at module load. The
// compatibility suite only imports/serializes scenes; it never renders one.
Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  value: () => ({ filter: "" }),
});

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
});
