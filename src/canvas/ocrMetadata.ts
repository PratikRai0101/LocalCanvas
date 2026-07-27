import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

const MAX_OCR_TEXT_LENGTH = 20_000;

export function attachOcrText(
  elements: readonly ExcalidrawElement[],
  fileIds: ReadonlySet<string>,
  text: string,
): ExcalidrawElement[] {
  const normalizedText = text.trim().slice(0, MAX_OCR_TEXT_LENGTH);
  if (!normalizedText) return [...elements];

  return elements.map((element) => {
    if (element.type !== "image" || !element.fileId || !fileIds.has(element.fileId)) return element;
    const localcanvas = element.customData?.localcanvas;
    const metadata = localcanvas && typeof localcanvas === "object" ? localcanvas : {};
    return {
      ...element,
      customData: {
        ...element.customData,
        localcanvas: { ...metadata, ocrText: normalizedText },
      },
    } as ExcalidrawElement;
  });
}
