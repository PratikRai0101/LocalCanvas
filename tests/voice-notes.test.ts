import { describe, expect, it } from "vitest";
import { createVoiceNoteMarker, formatVoiceNoteDuration, voiceNoteForSelection } from "../src/canvas/voiceNotes";

describe("voice note markers", () => {
  it("stores audio metadata in portable element customData", () => {
    const [marker] = createVoiceNoteMarker({
      id: "71a4dd2c-98e7-4e4a-86bd-885c64bbf39b",
      mimeType: "audio/mp4",
      durationMs: 62_400,
      transcript: "Local only transcript",
      attachedToElementId: "attached-element",
    });
    expect(marker.customData).toEqual({
      localcanvas: {
        kind: "voice-note",
        noteId: "71a4dd2c-98e7-4e4a-86bd-885c64bbf39b",
        mimeType: "audio/mp4",
        durationMs: 62_400,
        transcript: "Local only transcript",
        attachedToElementId: "attached-element",
      },
    });
    expect(voiceNoteForSelection([marker], { [marker.id]: true })).toEqual({
      id: "71a4dd2c-98e7-4e4a-86bd-885c64bbf39b",
      mimeType: "audio/mp4",
      durationMs: 62_400,
      transcript: "Local only transcript",
      attachedToElementId: "attached-element",
    });
  });

  it("formats a compact duration for the marker and inspector", () => {
    expect(formatVoiceNoteDuration(62_400)).toBe("1:02");
  });
});
