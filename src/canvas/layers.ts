import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

export type LayerEntry = {
  id: string;
  label: string;
  hidden: boolean;
  locked: boolean;
};

type Direction = "forward" | "backward";
type LocalCanvasData = Record<string, unknown> & {
  kind?: string;
  layerVisibility?: { opacity: number };
};

export function layerEntries(elements: readonly ExcalidrawElement[]): LayerEntry[] {
  return elements
    .filter((element) => !element.isDeleted && !isDrawingMetadata(element))
    .map((element) => ({
      id: element.id,
      label: layerLabel(element),
      hidden: element.opacity === 0,
      locked: element.locked,
    }))
    .reverse();
}

export function moveLayer(
  elements: readonly ExcalidrawElement[],
  id: string,
  direction: Direction,
): ExcalidrawElement[] {
  const index = elements.findIndex((element) => element.id === id);
  if (index < 0) return [...elements];

  const step = direction === "forward" ? 1 : -1;
  let target = index + step;
  while (target >= 0 && target < elements.length && isDrawingMetadata(elements[target])) {
    target += step;
  }
  if (target < 0 || target >= elements.length) return [...elements];

  const next = [...elements];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function setLayerVisibility(
  elements: readonly ExcalidrawElement[],
  id: string,
  visible: boolean,
): ExcalidrawElement[] {
  return elements.map((element) => {
    if (element.id !== id) return element;

    const localcanvas = localCanvasData(element);
    const storedOpacity = localcanvas.layerVisibility?.opacity;
    const nextLocalcanvas: LocalCanvasData = { ...localcanvas };
    if (visible) {
      delete nextLocalcanvas.layerVisibility;
    } else {
      nextLocalcanvas.layerVisibility = { opacity: element.opacity };
    }

    return {
      ...element,
      opacity: visible ? storedOpacity ?? 100 : 0,
      customData: { ...element.customData, localcanvas: nextLocalcanvas },
    } as ExcalidrawElement;
  });
}

export function setLayerLocked(
  elements: readonly ExcalidrawElement[],
  id: string,
  locked: boolean,
): ExcalidrawElement[] {
  return elements.map((element) => element.id === id ? { ...element, locked } as ExcalidrawElement : element);
}

function isDrawingMetadata(element: ExcalidrawElement) {
  return localCanvasData(element).kind === "drawing-metadata";
}

function localCanvasData(element: ExcalidrawElement): LocalCanvasData {
  const value = element.customData?.localcanvas;
  return value && typeof value === "object" ? value as LocalCanvasData : {};
}

function layerLabel(element: ExcalidrawElement) {
  if (element.type === "text") return element.text.trim() || "Text";
  if (element.type === "image") return "Image";
  if (element.type === "freedraw") return "Drawing";
  return element.type.charAt(0).toUpperCase() + element.type.slice(1);
}
