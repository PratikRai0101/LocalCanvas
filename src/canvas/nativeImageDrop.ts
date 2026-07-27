export type PhysicalPosition = { x: number; y: number };
type CanvasBounds = { left: number; top: number; right: number; bottom: number };

const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|svg)$/i;

/**
 * Tauri reports a physical position relative to its native window. The webview
 * itself starts below the native title bar, so convert it to the browser's
 * client coordinate system before passing it to Excalidraw.
 */
export function clientPositionInCanvas(
  position: PhysicalPosition,
  webviewPosition: PhysicalPosition,
  scaleFactor: number,
  bounds: CanvasBounds,
): PhysicalPosition | null {
  const scale = scaleFactor > 0 ? scaleFactor : 1;
  const candidates = [
    {
      x: (position.x - webviewPosition.x) / scale,
      y: (position.y - webviewPosition.y) / scale,
    },
    // Some WebKit versions report the position relative to the webview rather
    // than the native window. Keep this fallback so drops remain reliable.
    { x: position.x / scale, y: position.y / scale },
  ];
  return candidates.find(({ x, y }) => x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) ?? null;
}

export function isSupportedImagePath(path: string) {
  return IMAGE_EXTENSION.test(path);
}
