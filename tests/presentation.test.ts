import { describe, expect, it } from "vitest";
import { presentationFrames } from "../src/canvas/presentation";

describe("presentationFrames", () => {
  it("keeps non-deleted frames in their scene order", () => {
    const frames = presentationFrames([
      { id: "first", type: "frame", isDeleted: false },
      { id: "deleted", type: "frame", isDeleted: true },
      { id: "shape", type: "rectangle", isDeleted: false },
      { id: "second", type: "magicframe", isDeleted: false },
    ]);

    expect(frames.map((frame) => frame.id)).toEqual(["first", "second"]);
  });
});
