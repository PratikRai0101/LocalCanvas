import { describe, expect, it } from "vitest";
import { createVoiceNoteMarker, voiceNoteForSelection } from "../src/canvas/voiceNotes";

describe("voice note markers", () => {
  it("stores the audio reference in portable element customData", () => {
    const [marker] = createVoiceNoteMarker({ id: "71a4dd2c-98e7-4e4a-86bd-885c64bbf39b", mimeType: "audio/webm" });
    expect(marker.customData).toEqual({
      localcanvas: { kind: "voice-note", noteId: "71a4dd2c-98e7-4e4a-86bd-885c64bbf39b", mimeType: "audio/webm" },
    });
    expect(voiceNoteForSelection([marker], { [marker.id]: true })).toEqual({
      id: "71a4dd2c-98e7-4e4a-86bd-885c64bbf39b",
      mimeType: "audio/webm",
    });
  });
});
