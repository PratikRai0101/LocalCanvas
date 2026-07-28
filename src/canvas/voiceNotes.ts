import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

export type VoiceNote = {
  id: string;
  mimeType: string;
};

type ElementWithCustomData = Pick<ExcalidrawElement, "id" | "customData">;

export function createVoiceNoteMarker(note: VoiceNote, x = 100, y = 100) {
  return convertToExcalidrawElements([{
    type: "ellipse",
    x,
    y,
    width: 36,
    height: 36,
    strokeColor: "#d97706",
    backgroundColor: "#fef3c7",
    fillStyle: "solid",
    customData: {
      localcanvas: { kind: "voice-note", noteId: note.id, mimeType: note.mimeType },
    },
    label: { text: "🎙" },
  }], { regenerateIds: false });
}

export function voiceNoteForSelection(
  elements: readonly ElementWithCustomData[],
  selectedElementIds: Record<string, boolean>,
): VoiceNote | null {
  for (const element of elements) {
    if (!selectedElementIds[element.id]) continue;
    const value = element.customData?.localcanvas;
    if (!value || typeof value !== "object") continue;
    const note = value as { kind?: unknown; noteId?: unknown; mimeType?: unknown };
    if (note.kind === "voice-note" && typeof note.noteId === "string" && typeof note.mimeType === "string") {
      return { id: note.noteId, mimeType: note.mimeType };
    }
  }
  return null;
}
