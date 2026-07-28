import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

export type VoiceNote = {
  id: string;
  mimeType: string;
  durationMs: number;
  transcript?: string;
  attachedToElementId?: string;
};

type ElementWithCustomData = Pick<ExcalidrawElement, "id" | "customData"> & {
  containerId?: string | null;
};

export function createVoiceNoteMarker(note: VoiceNote, x = 100, y = 100) {
  return convertToExcalidrawElements([{
    type: "ellipse",
    x,
    y,
    width: 42,
    height: 42,
    strokeColor: "#b45309",
    backgroundColor: "#fef3c7",
    fillStyle: "solid",
    customData: {
      localcanvas: { kind: "voice-note", noteId: note.id, mimeType: note.mimeType, durationMs: note.durationMs, transcript: note.transcript, attachedToElementId: note.attachedToElementId },
    },
    label: { text: `🎙 ${formatVoiceNoteDuration(note.durationMs)}` },
  }], { regenerateIds: false });
}

export function voiceNoteForSelection(
  elements: readonly ElementWithCustomData[],
  selectedElementIds: Record<string, boolean>,
): VoiceNote | null {
  for (const element of elements) {
    if (!selectedElementIds[element.id]) continue;
    const note = voiceNoteForElement(element);
    if (note) return note;
    if (element.containerId) {
      const container = elements.find((candidate) => candidate.id === element.containerId);
      const containerNote = container && voiceNoteForElement(container);
      if (containerNote) return containerNote;
    }
  }
  return null;
}

export function voiceNoteMarkerIdForSelection(
  elements: readonly ElementWithCustomData[],
  selectedElementIds: Record<string, boolean>,
): string | null {
  for (const element of elements) {
    if (!selectedElementIds[element.id]) continue;
    if (voiceNoteForElement(element)) return element.id;
    if (element.containerId) {
      const container = elements.find((candidate) => candidate.id === element.containerId);
      if (container && voiceNoteForElement(container)) return container.id;
    }
  }
  return null;
}

export function formatVoiceNoteDuration(durationMs: number) {
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function voiceNoteForElement(element: ElementWithCustomData): VoiceNote | null {
  const value = element.customData?.localcanvas;
  if (!value || typeof value !== "object") return null;
  const note = value as { kind?: unknown; noteId?: unknown; mimeType?: unknown; durationMs?: unknown; transcript?: unknown; attachedToElementId?: unknown };
  if (note.kind !== "voice-note" || typeof note.noteId !== "string" || typeof note.mimeType !== "string") return null;
  return {
    id: note.noteId,
    mimeType: note.mimeType,
    durationMs: typeof note.durationMs === "number" ? note.durationMs : 0,
    ...(typeof note.transcript === "string" && note.transcript.trim() ? { transcript: note.transcript } : {}),
    ...(typeof note.attachedToElementId === "string" ? { attachedToElementId: note.attachedToElementId } : {}),
  };
}
