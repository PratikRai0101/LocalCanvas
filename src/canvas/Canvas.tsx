import {
  Excalidraw,
  exportToBlob,
  exportToSvg,
  loadFromBlob,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  ExcalidrawProps,
} from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { libraryApi } from "../library/api";

type CanvasProps = {
  drawingPath: string;
  drawingTitle: string;
  onSaveStatus: (status: SaveStatus) => void;
  onSaved: () => void;
};

export type SaveStatus = "saved" | "saving" | "error";

type SceneChange = Parameters<NonNullable<ExcalidrawProps["onChange"]>>;
type SceneSnapshot = {
  elements: SceneChange[0];
  appState: SceneChange[1];
  files: SceneChange[2];
};

const AUTOSAVE_DELAY_MS = 800;

export function Canvas({
  drawingPath,
  drawingTitle,
  onSaveStatus,
  onSaved,
}: CanvasProps) {
  const [initialData, setInitialData] =
    useState<ExcalidrawInitialDataState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const latestScene = useRef<SceneSnapshot | null>(null);
  const excalidrawApi = useRef<ExcalidrawImperativeAPI | null>(null);
  const saveTimer = useRef<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const saveLatestScene = useCallback(async () => {
    const scene = latestScene.current;
    if (!scene) {
      return;
    }

    onSaveStatus("saving");
    try {
      // Excalidraw owns serialization so we preserve its format, including
      // element customData, rather than recreating the JSON schema ourselves.
      const sceneJson = serializeAsJSON(
        scene.elements,
        scene.appState,
        scene.files,
        "local",
      );
      await libraryApi.writeScene(drawingPath, sceneJson);
      onSaveStatus("saved");
      onSaved();
    } catch (error) {
      console.error("Failed to autosave drawing", error);
      onSaveStatus("error");
    }
  }, [drawingPath, onSaved, onSaveStatus]);

  useEffect(() => {
    let cancelled = false;
    latestScene.current = null;
    setInitialData(null);
    setLoadError(null);

    async function load() {
      try {
        const contents = await libraryApi.readScene(drawingPath);
        const restored = await loadFromBlob(
          new Blob([contents], { type: "application/json" }),
          null,
          null,
        );
        if (!cancelled) {
          setInitialData(restored);
          onSaveStatus("saved");
        }
      } catch (error) {
        console.error("Failed to load drawing", error);
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Unable to load drawing.");
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [drawingPath, onSaveStatus]);

  useEffect(
    () => () => {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
        void saveLatestScene();
      }
    },
    [saveLatestScene],
  );

  const exportScene = useCallback(async (format: "png" | "svg") => {
    const api = excalidrawApi.current;
    if (!api) {
      return;
    }

    setIsExporting(true);
    try {
      const options = {
        elements: api.getSceneElements(),
        // Excalidraw embeds the source scene only when this flag is set,
        // making the exported PNG/SVG reopenable rather than a flat image.
        appState: { ...api.getAppState(), exportEmbedScene: true },
        files: api.getFiles(),
        exportPadding: 10,
      };
      const contents = format === "png"
        ? new Uint8Array(await (await exportToBlob({ ...options, mimeType: "image/png" })).arrayBuffer())
        : new TextEncoder().encode(new XMLSerializer().serializeToString(await exportToSvg(options)));
      await libraryApi.exportFile(drawingTitle, format, contents);
    } catch (error) {
      console.error(`Failed to export ${format}`, error);
      onSaveStatus("error");
    } finally {
      setIsExporting(false);
    }
  }, [drawingTitle, onSaveStatus]);

  const scheduleAutosave = useCallback(
    (...change: SceneChange) => {
      latestScene.current = {
        elements: change[0],
        appState: change[1],
        files: change[2],
      };

      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
      }
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = null;
        void saveLatestScene();
      }, AUTOSAVE_DELAY_MS);
    },
    [saveLatestScene],
  );

  if (loadError) {
    return (
      <div className="canvas-message canvas-message-error">
        <strong>Couldn&apos;t open {drawingTitle}</strong>
        <span>{loadError}</span>
      </div>
    );
  }

  if (!initialData) {
    return <div className="canvas-message">Opening canvas…</div>;
  }

  return (
    <div className="canvas-host">
      <div className="canvas-export-actions">
        <button type="button" onClick={() => void exportScene("png")} disabled={isExporting}>
          Export PNG
        </button>
        <button type="button" onClick={() => void exportScene("svg")} disabled={isExporting}>
          Export SVG
        </button>
      </div>
      <Excalidraw
        autoFocus
        excalidrawAPI={(api) => { excalidrawApi.current = api; }}
        initialData={initialData}
        name={drawingTitle}
        onChange={scheduleAutosave}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
          },
        }}
      />
    </div>
  );
}
