import { describe, expect, it } from "vitest";
import { attachOcrText } from "../src/canvas/ocrMetadata";

const elements = [
  { id: "portal", type: "rectangle", isDeleted: false, customData: { localcanvas: { kind: "portal", targetId: "target" } } },
  { id: "image", type: "image", isDeleted: false, fileId: "file-1", customData: null },
] as never;

describe("attachOcrText", () => {
  it("stores recognized text on the pasted image without changing other metadata", () => {
    const updated = attachOcrText(elements, new Set(["file-1"]), "  Architecture diagram  ");

    expect(updated[0]).toBe(elements[0]);
    expect(updated[1]).toMatchObject({
      customData: { localcanvas: { ocrText: "Architecture diagram" } },
    });
  });

  it("does not add metadata when Vision finds no text", () => {
    expect(attachOcrText(elements, new Set(["file-1"]), "  ")).toEqual(elements);
  });
});
