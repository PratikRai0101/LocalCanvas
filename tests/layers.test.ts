import { describe, expect, it } from "vitest";
import { layerEntries, moveLayer, setLayerVisibility } from "../src/canvas/layers";

const elements = [
  { id: "metadata", type: "rectangle", isDeleted: false, opacity: 0, locked: true, customData: { localcanvas: { kind: "drawing-metadata", drawingId: "drawing-id" } } },
  { id: "back", type: "rectangle", isDeleted: false, opacity: 100, locked: false, customData: null },
  { id: "note", type: "text", text: "Architecture note", isDeleted: false, opacity: 100, locked: false, customData: null },
  { id: "removed", type: "ellipse", isDeleted: true, opacity: 100, locked: false, customData: null },
] as never;

describe("layers", () => {
  it("lists visible scene elements from front to back without LocalCanvas metadata", () => {
    expect(layerEntries(elements).map((layer) => [layer.id, layer.label])).toEqual([
      ["note", "Architecture note"],
      ["back", "Rectangle"],
    ]);
  });

  it("moves a layer forward without moving the drawing metadata", () => {
    expect(moveLayer(elements, "back", "forward").map((element) => element.id)).toEqual([
      "metadata", "note", "back", "removed"],
    );
  });

  it("hides and restores an element without losing its original opacity", () => {
    const hidden = setLayerVisibility(elements, "note", false);
    expect(hidden.find((element) => element.id === "note")).toMatchObject({ opacity: 0 });

    const restored = setLayerVisibility(hidden, "note", true);
    expect(restored.find((element) => element.id === "note")).toMatchObject({ opacity: 100 });
  });
});
