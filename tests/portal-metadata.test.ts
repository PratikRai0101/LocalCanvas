import { loadFromBlob, serializeAsJSON } from "@excalidraw/excalidraw";
import { describe, expect, it } from "vitest";
import { ensureDrawingIdentity, findDrawingId } from "../src/canvas/portalMetadata";

describe("drawing identity metadata", () => {
  it("creates one durable identity marker without adding scene-level metadata", async () => {
    const identity = ensureDrawingIdentity([]);

    expect(identity.wasCreated).toBe(true);
    expect(identity.elements).toHaveLength(1);
    expect(identity.elements[0]).toMatchObject({ opacity: 0, locked: true });
    expect(findDrawingId(identity.elements)).toBe(identity.drawingId);

    const scene = serializeAsJSON(identity.elements, {}, {}, "local");
    const restored = await loadFromBlob(
      new Blob([scene], { type: "application/json" }),
      null,
      null,
    );

    expect(findDrawingId(restored.elements)).toBe(identity.drawingId);
    expect(ensureDrawingIdentity(restored.elements)).toMatchObject({
      drawingId: identity.drawingId,
      wasCreated: false,
    });
  });
});
