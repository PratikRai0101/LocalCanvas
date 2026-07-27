import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadFromBlob, serializeAsJSON } from "@excalidraw/excalidraw";

describe("Excalidraw compatibility", () => {
  it("round-trips the fixture through upstream Excalidraw serialization", async () => {
    const fixture = await readFile("tests/fixtures/excalidraw/basic.excalidraw", "utf8");

    const restored = await loadFromBlob(
      new Blob([fixture], { type: "application/json" }),
      null,
      null,
    );
    const exported = JSON.parse(
      serializeAsJSON(restored.elements, restored.appState, restored.files, "local"),
    ) as {
      type: string;
      elements: Array<{ customData?: unknown }>;
      appState: Record<string, unknown>;
      files: Record<string, unknown>;
    };

    expect(exported.type).toBe("excalidraw");
    expect(exported.elements).toHaveLength(1);
    expect(exported.elements[0].customData).toEqual({
      localcanvas: {
        kind: "portal",
        targetId: "b2f1c9e0-1111-2222-3333-444444444444",
        targetPath: "Architecture/db-schema.excalidraw",
      },
    });
    expect(exported.appState).toBeTypeOf("object");
    expect(exported.files).toEqual({});
  });
});
