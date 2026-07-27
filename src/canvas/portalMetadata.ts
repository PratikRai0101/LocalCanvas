import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

const LOCALCANVAS_KEY = "localcanvas";
const DRAWING_METADATA_KIND = "drawing-metadata";

type DrawingMetadata = {
  kind: typeof DRAWING_METADATA_KIND;
  drawingId: string;
};

type ElementWithCustomData = Pick<ExcalidrawElement, "customData">;

export type DrawingIdentity = {
  drawingId: string;
  elements: readonly ExcalidrawElement[];
  wasCreated: boolean;
};

export type PortalTarget = {
  drawingId: string;
  path: string;
  title: string;
};

export function ensureDrawingIdentity(elements: readonly ExcalidrawElement[]): DrawingIdentity {
  const existingDrawingId = findDrawingId(elements);
  if (existingDrawingId) {
    return { drawingId: existingDrawingId, elements, wasCreated: false };
  }

  const drawingId = crypto.randomUUID();
  const [marker] = convertToExcalidrawElements([{
    type: "rectangle",
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    opacity: 0,
    locked: true,
    customData: {
      [LOCALCANVAS_KEY]: {
        kind: DRAWING_METADATA_KIND,
        drawingId,
      } satisfies DrawingMetadata,
    },
  }], { regenerateIds: false });

  // A locked, fully transparent normal Excalidraw element remains portable
  // and survives upstream serialization without appearing on canvas.
  // This gives the scene a durable identity without a custom scene-level field.
  return { drawingId, elements: [...elements, marker], wasCreated: true };
}

export function createPortalElements(target: PortalTarget, x = 100, y = 100) {
  return convertToExcalidrawElements([{
    type: "rectangle",
    x,
    y,
    width: 240,
    height: 72,
    strokeColor: "#6965db",
    backgroundColor: "#eeedff",
    fillStyle: "solid",
    customData: {
      [LOCALCANVAS_KEY]: {
        kind: "portal",
        targetId: target.drawingId,
        targetPath: target.path,
      },
    },
    label: { text: target.title },
  }], { regenerateIds: false });
}

export function portalTargetPathForSelection(
  elements: readonly ExcalidrawElement[],
  selectedElementIds: Record<string, boolean>,
): string | null {
  const selected = elements.filter((element) => selectedElementIds[element.id]);
  for (const element of selected) {
    const targetPath = portalTargetPath(element);
    if (targetPath) {
      return targetPath;
    }
    const containerId = (element as { containerId?: string | null }).containerId;
    if (containerId) {
      const container = elements.find((candidate) => candidate.id === containerId);
      const containerTargetPath = container && portalTargetPath(container);
      if (containerTargetPath) {
        return containerTargetPath;
      }
    }
  }
  return null;
}

export function findDrawingId(elements: readonly ElementWithCustomData[]): string | null {
  for (const element of elements) {
    const localcanvas = element.customData?.[LOCALCANVAS_KEY];
    if (!isDrawingMetadata(localcanvas)) {
      continue;
    }
    return localcanvas.drawingId;
  }
  return null;
}

function portalTargetPath(element: ElementWithCustomData): string | null {
  const localcanvas = element.customData?.[LOCALCANVAS_KEY];
  if (!localcanvas || typeof localcanvas !== "object") {
    return null;
  }
  const portal = localcanvas as { kind?: unknown; targetPath?: unknown };
  return portal.kind === "portal" && typeof portal.targetPath === "string"
    ? portal.targetPath
    : null;
}

function isDrawingMetadata(value: unknown): value is DrawingMetadata {
  if (!value || typeof value !== "object") {
    return false;
  }
  const metadata = value as Partial<DrawingMetadata>;
  return metadata.kind === DRAWING_METADATA_KIND
    && typeof metadata.drawingId === "string"
    && metadata.drawingId.length > 0;
}
