import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  convertToExcalidrawElements,
  Excalidraw,
  getDataURL,
  loadFromBlob,
  serializeAsJSON,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  ExcalidrawProps,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { DrawingSummary, libraryApi } from "../library/api";
import { clientPositionInCanvas, isSupportedImagePath } from "./nativeImageDrop";
import { LayersPanel } from "./LayersPanel";
import { layerEntries, moveLayer, setLayerLocked, setLayerVisibility } from "./layers";
import { presentationFrames } from "./presentation";
import { createPortalElements, ensureDrawingIdentity, portalTargetForSelection } from "./portalMetadata";
import type { PortalLink } from "./portalMetadata";

type CanvasProps = {
  drawingPath: string;
  drawingTitle: string;
  isLayersOpen: boolean;
  onCloseLayers: () => void;
  onSaveStatus: (status: SaveStatus) => void;
  onSaved: () => void;
  onAutosaveController?: (controller: { flush: () => Promise<void>; suspend: () => void } | null) => void;
  portalTargets: DrawingSummary[];
  onOpenPortal: (target: PortalLink) => void;
};

export type SaveStatus = "saved" | "saving" | "error";

type SceneChange = Parameters<NonNullable<ExcalidrawProps["onChange"]>>;
type SceneSnapshot = {
  elements: SceneChange[0];
  appState: SceneChange[1];
  files: SceneChange[2];
};
type PresentationFrame = Extract<SceneChange[0][number], { type: "frame" | "magicframe" }>;

const AUTOSAVE_DELAY_MS = 800;

export function Canvas({
  drawingPath,
  drawingTitle,
  isLayersOpen,
  onCloseLayers,
  onSaveStatus,
  onSaved,
  onAutosaveController,
  portalTargets,
  onOpenPortal,
}: CanvasProps) {
  const [initialData, setInitialData] =
    useState<ExcalidrawInitialDataState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const latestScene = useRef<SceneSnapshot | null>(null);
  const canvasHost = useRef<HTMLDivElement | null>(null);
  const excalidrawApi = useRef<ExcalidrawImperativeAPI | null>(null);
  const isInsertingNativeDrop = useRef(false);
  const presentationActive = useRef(false);
  const onOpenPortalRef = useRef(onOpenPortal);
  const unsubscribePortalPointer = useRef<(() => void) | null>(null);
  const saveTimer = useRef<number | null>(null);
  const autosaveSuspended = useRef(false);
  const [isPortalPickerOpen, setIsPortalPickerOpen] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [presentationSlides, setPresentationSlides] = useState<PresentationFrame[]>([]);
  const [presentationSlideIndex, setPresentationSlideIndex] = useState(0);
  const [isPresenting, setIsPresenting] = useState(false);
  const [layerElements, setLayerElements] = useState<readonly ExcalidrawElement[]>([]);
  const [presentationMessage, setPresentationMessage] = useState<string | null>(null);
  const [usesNativeFileDrops, setUsesNativeFileDrops] = useState(false);
  const [portalTargetPath, setPortalTargetPath] = useState("");
  const [isCreatingPortal, setIsCreatingPortal] = useState(false);

  useEffect(() => {
    onOpenPortalRef.current = onOpenPortal;
  }, [onOpenPortal]);

  useEffect(() => () => unsubscribePortalPointer.current?.(), []);

  const bindExcalidrawApi = useCallback((api: ExcalidrawImperativeAPI) => {
    excalidrawApi.current = api;
    unsubscribePortalPointer.current?.();
    unsubscribePortalPointer.current = api.onPointerUp((_tool, _pointerState, event) => {
      if (event.detail !== 2) {
        return;
      }
      const target = portalTargetForSelection(
        api.getSceneElementsIncludingDeleted(),
        api.getAppState().selectedElementIds,
      );
      if (target) {
        onOpenPortalRef.current(target);
      }
    });
  }, []);

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
        const identity = ensureDrawingIdentity(restored.elements);
        if (identity.wasCreated) {
          await libraryApi.writeScene(
            drawingPath,
            serializeAsJSON(identity.elements, restored.appState, restored.files, "local"),
          );
        }
        if (!cancelled) {
          setInitialData({ ...restored, elements: identity.elements });
          setFrameCount(presentationFrames(identity.elements).length);
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

  const flushAutosave = useCallback(async () => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    await saveLatestScene();
  }, [saveLatestScene]);

  const suspendAutosave = useCallback(() => {
    autosaveSuspended.current = true;
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
  }, []);

  useEffect(() => {
    onAutosaveController?.({ flush: flushAutosave, suspend: suspendAutosave });
    return () => onAutosaveController?.(null);
  }, [flushAutosave, onAutosaveController, suspendAutosave]);

  useEffect(
    () => () => {
      if (saveTimer.current !== null) {
        void flushAutosave();
      }
    },
    [flushAutosave],
  );

  useEffect(() => {
    if (isLayersOpen) {
      setLayerElements(excalidrawApi.current?.getSceneElementsIncludingDeleted() ?? []);
    }
  }, [isLayersOpen]);

  const selectLayer = useCallback((id: string) => {
    const api = excalidrawApi.current;
    const element = api?.getSceneElementsIncludingDeleted().find((candidate) => candidate.id === id);
    if (!api || !element) return;
    api.updateScene({ appState: { selectedElementIds: { [id]: true } } });
    api.scrollToContent(element, { fitToViewport: false, animate: true });
  }, []);

  const updateLayers = useCallback((update: (elements: readonly ExcalidrawElement[]) => ExcalidrawElement[]) => {
    const api = excalidrawApi.current;
    if (!api) return;
    const next = update(api.getSceneElementsIncludingDeleted());
    api.updateScene({ elements: next });
    setLayerElements(next);
  }, []);

  const startPresentation = useCallback(() => {
    const api = excalidrawApi.current;
    if (!api) {
      return;
    }
    const slides = presentationFrames(api.getSceneElementsIncludingDeleted()) as PresentationFrame[];
    if (!slides.length) {
      setPresentationMessage("Add a frame to create presentation slides.");
      return;
    }
    setPresentationMessage(null);
    presentationActive.current = true;
    setPresentationSlides(slides);
    setPresentationSlideIndex(0);
    setIsPresenting(true);
  }, []);

  const exitPresentation = useCallback(() => {
    presentationActive.current = false;
    setIsPresenting(false);
    setPresentationSlides([]);
  }, []);

  useEffect(() => {
    if (!isPresenting) {
      return;
    }
    const slide = presentationSlides[presentationSlideIndex];
    const api = excalidrawApi.current;
    if (!slide || !api) {
      return;
    }
    const animationFrame = window.requestAnimationFrame(() => {
      api.scrollToContent(slide, {
        fitToViewport: true,
        viewportZoomFactor: 0.94,
        animate: false,
      });
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [isPresenting, presentationSlideIndex, presentationSlides]);

  useEffect(() => {
    if (!isPresenting) {
      return;
    }
    function handlePresentationKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        exitPresentation();
      } else if (event.key === "ArrowRight" || event.key === " " || event.key === "Enter") {
        event.preventDefault();
        setPresentationSlideIndex((index) => Math.min(index + 1, presentationSlides.length - 1));
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setPresentationSlideIndex((index) => Math.max(index - 1, 0));
      }
    }
    window.addEventListener("keydown", handlePresentationKey, true);
    return () => window.removeEventListener("keydown", handlePresentationKey, true);
  }, [exitPresentation, isPresenting, presentationSlides.length]);

  const insertNativeDroppedImage = useCallback(async (path: string, clientX: number, clientY: number) => {
    const api = excalidrawApi.current;
    if (!api || isInsertingNativeDrop.current) {
      return;
    }

    isInsertingNativeDrop.current = true;
    try {
      const droppedImage = await libraryApi.readDroppedImage(path);
      const file = new File(
        [new Uint8Array(droppedImage.contents)],
        droppedImage.fileName,
        { type: droppedImage.mimeType },
      );
      const appState = api.getAppState();
      const { width, height } = await imageDimensions(file);
      const maxHeight = Math.min(
        Math.max(appState.height - 120, 160),
        Math.floor(appState.height * 0.5) / appState.zoom.value,
      );
      const scaledHeight = Math.min(height, maxHeight);
      const scaledWidth = Math.max(1, scaledHeight * (width / height));
      const { x, y } = viewportCoordsToSceneCoords({ clientX, clientY }, appState);
      const fileId = crypto.randomUUID();
      const dataURL = await getDataURL(file);

      api.addFiles([{
        id: fileId as never,
        mimeType: droppedImage.mimeType as never,
        dataURL,
        created: Date.now(),
        lastRetrieved: Date.now(),
      }]);
      const elements = convertToExcalidrawElements([{
        type: "image",
        x: x - scaledWidth / 2,
        y: y - scaledHeight / 2,
        width: scaledWidth,
        height: scaledHeight,
        fileId: fileId as never,
        status: "saved",
      }]);
      api.updateScene({ elements: [...api.getSceneElementsIncludingDeleted(), ...elements] });
    } catch (error) {
      console.error("Failed to insert native dropped image", error);
      onSaveStatus("error");
    } finally {
      isInsertingNativeDrop.current = false;
    }
  }, [onSaveStatus]);

  useEffect(() => {
    if (!initialData) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | undefined;
    setUsesNativeFileDrops(false);

    void (async () => {
      try {
        const window = getCurrentWindow();
        const webview = getCurrentWebview();
        const [scaleFactor, webviewPosition] = await Promise.all([window.scaleFactor(), webview.position()]);
        unlisten = await window.onDragDropEvent(({ payload }) => {
          if (payload.type !== "drop" || !payload.paths.length || disposed) {
            return;
          }
          const path = payload.paths.find(isSupportedImagePath);
          const bounds = canvasHost.current?.getBoundingClientRect();
          if (!path || !bounds) {
            return;
          }
          const clientPosition = clientPositionInCanvas(payload.position, webviewPosition, scaleFactor, bounds);
          if (clientPosition) {
            void insertNativeDroppedImage(path, clientPosition.x, clientPosition.y);
          }
        });
        if (!disposed) {
          setUsesNativeFileDrops(true);
        } else {
          unlisten();
        }
      } catch {
        // Browser development mode has no Tauri native window. In that case,
        // leave Excalidraw's ordinary browser drag-and-drop behavior intact.
      }
    })();

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [initialData, insertNativeDroppedImage]);

  const createPortal = useCallback(async () => {
    const api = excalidrawApi.current;
    const target = portalTargets.find((drawing) => drawing.path === portalTargetPath);
    if (!api || !target) {
      return;
    }

    setIsCreatingPortal(true);
    try {
      const targetContents = await libraryApi.readScene(target.path);
      const targetScene = await loadFromBlob(
        new Blob([targetContents], { type: "application/json" }),
        null,
        null,
      );
      const targetIdentity = ensureDrawingIdentity(targetScene.elements);
      if (targetIdentity.wasCreated) {
        await libraryApi.writeScene(
          target.path,
          serializeAsJSON(targetIdentity.elements, targetScene.appState, targetScene.files, "local"),
        );
      }

      const currentElements = api.getSceneElementsIncludingDeleted();
      const sourceIdentity = ensureDrawingIdentity(currentElements);
      const portalElements = createPortalElements({
        drawingId: targetIdentity.drawingId,
        path: target.path,
        title: target.title,
      });
      api.updateScene({ elements: [...sourceIdentity.elements, ...portalElements] });
      setIsPortalPickerOpen(false);
      setPortalTargetPath("");
    } catch (error) {
      console.error("Failed to create portal", error);
      onSaveStatus("error");
    } finally {
      setIsCreatingPortal(false);
    }
  }, [onSaveStatus, portalTargetPath, portalTargets]);

  const scheduleAutosave = useCallback(
    (...change: SceneChange) => {
      if (autosaveSuspended.current) {
        return;
      }
      latestScene.current = {
        elements: change[0],
        appState: change[1],
        files: change[2],
      };
      setFrameCount(presentationFrames(change[0]).length);
      if (isLayersOpen) {
        setLayerElements(change[0]);
      }

      if (presentationActive.current) {
        return;
      }
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
      }
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = null;
        void saveLatestScene();
      }, AUTOSAVE_DELAY_MS);
    },
    [isLayersOpen, saveLatestScene],
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
    <div
      className={`canvas-host ${isPresenting ? "is-presenting" : ""}`}
      ref={canvasHost}
      onDragOverCapture={(event) => {
        if (usesNativeFileDrops && dataTransferContainsImage(event.dataTransfer)) {
          event.preventDefault();
        }
      }}
      onDropCapture={(event) => {
        if (usesNativeFileDrops && dataTransferContainsImage(event.dataTransfer)) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      {isLayersOpen && (
        <LayersPanel
          layers={layerEntries(layerElements)}
          onSelect={selectLayer}
          onMove={(id, direction) => updateLayers((elements) => moveLayer(elements, id, direction))}
          onSetVisible={(id, visible) => updateLayers((elements) => setLayerVisibility(elements, id, visible))}
          onSetLocked={(id, locked) => updateLayers((elements) => setLayerLocked(elements, id, locked))}
          onClose={onCloseLayers}
        />
      )}
      {isPortalPickerOpen && (
        <div className="portal-picker" role="dialog" aria-label="Create portal">
          <label>
            Link to drawing
            <select autoFocus value={portalTargetPath} onChange={(event) => setPortalTargetPath(event.currentTarget.value)}>
              <option value="">Choose a drawing</option>
              {portalTargets.map((target) => <option key={target.path} value={target.path}>{target.path}</option>)}
            </select>
          </label>
          <div>
            <button type="button" onClick={() => setIsPortalPickerOpen(false)} disabled={isCreatingPortal}>Cancel</button>
            <button type="button" onClick={() => void createPortal()} disabled={!portalTargetPath || isCreatingPortal}>
              {isCreatingPortal ? "Creating…" : "Create portal"}
            </button>
          </div>
        </div>
      )}
      {isPresenting && (
        <div className="presentation-mode" role="dialog" aria-modal="true" aria-label="Presentation mode">
          <div className="presentation-controls">
            <span>{presentationSlideIndex + 1} / {presentationSlides.length}</span>
            <button type="button" onClick={() => setPresentationSlideIndex((index) => Math.max(index - 1, 0))} disabled={presentationSlideIndex === 0}>‹</button>
            <button type="button" onClick={() => setPresentationSlideIndex((index) => Math.min(index + 1, presentationSlides.length - 1))} disabled={presentationSlideIndex === presentationSlides.length - 1}>›</button>
            <button type="button" onClick={exitPresentation}>Exit</button>
          </div>
          <p>← → navigate · Esc exit</p>
        </div>
      )}
      <Excalidraw
        autoFocus
        viewModeEnabled={isPresenting}
        zenModeEnabled={isPresenting}
        excalidrawAPI={bindExcalidrawApi}
        initialData={initialData}
        name={drawingTitle}
        onChange={scheduleAutosave}
        renderTopRightUI={() => isPresenting ? null : (
          <div className="localcanvas-canvas-actions">
            <button type="button" onClick={startPresentation} title={frameCount ? "Present frames" : "Add a frame to create presentation slides"}>
              Present
            </button>
            {presentationMessage && <span className="presentation-message" role="status">{presentationMessage}</span>}
            <button type="button" onClick={() => setIsPortalPickerOpen(true)} disabled={!portalTargets.length}>
              Link canvas
            </button>
          </div>
        )}
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

async function imageDimensions(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("The dropped file isn't a readable image."));
      image.src = objectUrl;
    });
    if (!dimensions.width || !dimensions.height) {
      throw new Error("The dropped image has no dimensions.");
    }
    return dimensions;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function dataTransferContainsImage(dataTransfer: DataTransfer) {
  return [...dataTransfer.files].some((file) => file.type.startsWith("image/") || isSupportedImagePath(file.name));
}
