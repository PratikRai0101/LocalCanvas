import { loadFromBlob, serializeAsJSON } from "@excalidraw/excalidraw";
import { describe, expect, it } from "vitest";
import { createPortalElements, ensureDrawingIdentity, findDrawingId, portalTargetPathForSelection } from "../src/canvas/portalMetadata";

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

  it("creates a portable portal element with the target's durable identity", async () => {
    const portal = createPortalElements({
      drawingId: "b2f1c9e0-1111-2222-3333-444444444444",
      path: "Architecture/db-schema.excalidraw",
      title: "DB schema",
    });
    const scene = serializeAsJSON(portal, {}, {}, "local");
    const restored = await loadFromBlob(
      new Blob([scene], { type: "application/json" }),
      null,
      null,
    );

    const rectangle = restored.elements.find((element) => element.type === "rectangle");
    expect(rectangle?.customData).toEqual({
      localcanvas: {
        kind: "portal",
        targetId: "b2f1c9e0-1111-2222-3333-444444444444",
        targetPath: "Architecture/db-schema.excalidraw",
      },
    });
    expect(portalTargetPathForSelection(restored.elements, { [rectangle!.id]: true }))
      .toBe("Architecture/db-schema.excalidraw");
  });
});
