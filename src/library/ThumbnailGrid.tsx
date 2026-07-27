import { exportToSvg, loadFromBlob } from "@excalidraw/excalidraw";
import { MouseEvent, useEffect, useState } from "react";
import type { DrawingSummary } from "./api";
import { libraryApi } from "./api";

type ThumbnailGridProps = {
  drawings: DrawingSummary[];
  onSelect: (drawing: DrawingSummary) => void;
  onContextMenu: (
    event: MouseEvent<HTMLButtonElement>,
    target: { kind: "drawing"; path: string; label: string },
  ) => void;
};

type ThumbnailUrls = Record<string, string | null>;

export function ThumbnailGrid({ drawings, onSelect, onContextMenu }: ThumbnailGridProps) {
  const [thumbnailUrls, setThumbnailUrls] = useState<ThumbnailUrls>({});

  useEffect(() => {
    let cancelled = false;

    async function loadThumbnails() {
      const entries = await Promise.all(
        drawings.map(async (drawing) => [
          drawing.path,
          await loadThumbnail(drawing),
        ] as const),
      );

      if (!cancelled) {
        setThumbnailUrls(Object.fromEntries(entries));
      }
    }

    void loadThumbnails().catch((error) => {
      console.error("Failed to load drawing thumbnails", error);
    });

    return () => {
      cancelled = true;
    };
  }, [drawings]);

  if (!drawings.length) {
    return (
      <div className="library-grid-empty">
        <div className="empty-canvas-icon">▱</div>
        <h1>No drawings here yet</h1>
        <p>Create a drawing or choose another folder.</p>
      </div>
    );
  }

  return (
    <section className="library-grid" aria-label="Drawing thumbnails">
      <div className="library-grid-heading">
        <div>
          <p className="dialog-eyebrow">DRAWINGS</p>
          <h1>Browse your canvases</h1>
        </div>
        <span>{drawings.length} {drawings.length === 1 ? "drawing" : "drawings"}</span>
      </div>
      <div className="thumbnail-grid">
        {drawings.map((drawing) => (
          <button
            className="drawing-card"
            key={drawing.path}
            type="button"
            onClick={() => onSelect(drawing)}
            onContextMenu={(event) => onContextMenu(event, {
              kind: "drawing",
              path: drawing.path,
              label: drawing.title,
            })}
          >
            <span className="drawing-thumbnail">
              {thumbnailUrls[drawing.path] ? (
                <img alt="" src={thumbnailUrls[drawing.path] ?? undefined} />
              ) : (
                <span className="drawing-thumbnail-placeholder">✦</span>
              )}
            </span>
            <strong>{drawing.title}</strong>
            <small>{formatDate(drawing.modifiedAt)}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

async function loadThumbnail(drawing: DrawingSummary) {
  try {
    const cached = await libraryApi.readThumbnail(drawing.path);
    if (cached) {
      return svgDataUrl(cached);
    }

    const sceneJson = await libraryApi.readScene(drawing.path);
    const scene = await loadFromBlob(
      new Blob([sceneJson], { type: "application/json" }),
      null,
      null,
    );
    // The published runtime accepts an options object even though the pinned
    // package's declaration still describes its older positional signature.
    const svg = await (exportToSvg as unknown as (options: {
      elements: typeof scene.elements;
      appState: {
        exportBackground: boolean;
        exportPadding: number;
        viewBackgroundColor: string;
      };
      files: typeof scene.files;
      skipInliningFonts: boolean;
    }) => Promise<SVGSVGElement>)({
      elements: scene.elements,
      appState: {
        exportBackground: true,
        exportPadding: 24,
        viewBackgroundColor: scene.appState.viewBackgroundColor ?? "#ffffff",
      },
      files: scene.files,
      skipInliningFonts: true,
    });
    const markup = svg.outerHTML;
    await libraryApi.writeThumbnail(drawing.path, markup);
    return svgDataUrl(markup);
  } catch (error) {
    console.error(`Failed to generate thumbnail for ${drawing.path}`, error);
    return null;
  }
}

function svgDataUrl(svg: string) {
  const bytes = new TextEncoder().encode(svg);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(timestamp);
}
