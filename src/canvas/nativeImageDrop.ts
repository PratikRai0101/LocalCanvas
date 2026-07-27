export type PhysicalPosition = { x: number; y: number };
type CanvasBounds = { left: number; top: number; right: number; bottom: number };

const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|svg)$/i;

/**
 * WKWebView reports Cocoa logical points even though Tauri's public type names
 * this a PhysicalPosition. Those points match browser client coordinates. The
 * physical-coordinate variants remain as fallbacks for other webview hosts.
 */
export function clientPositionInCanvas(
  position: PhysicalPosition,
  webviewPosition: PhysicalPosition,
  scaleFactor: number,
  bounds: CanvasBounds,
): PhysicalPosition | null {
  const scale = scaleFactor > 0 ? scaleFactor : 1;
  const candidates = [
    // Wry's macOS WKWebView backend provides logical NSPoint values here.
    { x: position.x, y: position.y },
    {
      x: (position.x - webviewPosition.x) / scale,
      y: (position.y - webviewPosition.y) / scale,
    },
    { x: position.x / scale, y: position.y / scale },
  ];
  return candidates.find(({ x, y }) => x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) ?? null;
}

export function isSupportedImagePath(path: string) {
  return IMAGE_EXTENSION.test(path);
}
