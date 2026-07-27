import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { exportToSvg, loadFromBlob } from "@excalidraw/excalidraw";

type SvgExport = (options: {
  elements: Awaited<ReturnType<typeof loadFromBlob>>["elements"];
  appState: {
    exportBackground: boolean;
    exportPadding: number;
    viewBackgroundColor: string;
  };
  files: Awaited<ReturnType<typeof loadFromBlob>>["files"];
  skipInliningFonts: boolean;
}) => Promise<SVGSVGElement>;

describe("thumbnail export", () => {
  it("renders scene elements through Excalidraw's public SVG exporter", async () => {
    const fixture = await readFile("tests/fixtures/excalidraw/basic.excalidraw", "utf8");
    const scene = await loadFromBlob(
      new Blob([fixture], { type: "application/json" }),
      null,
      null,
    );

    // The pinned package's declaration has its older positional signature;
    // its public runtime API accepts this options object.
    const svg = await (exportToSvg as unknown as SvgExport)({
      elements: scene.elements,
      appState: {
        exportBackground: true,
        exportPadding: 24,
        viewBackgroundColor: scene.appState.viewBackgroundColor ?? "#ffffff",
      },
      files: scene.files,
      skipInliningFonts: true,
    });

    expect(svg.querySelector("path")).not.toBeNull();
  });
});
