import { exportToSvg, loadFromBlob } from "@excalidraw/excalidraw";
import { useEffect, useState } from "react";
import type { SceneVersion } from "../library/api";
import { libraryApi } from "../library/api";

type HistoryPanelProps = {
  drawingPath: string;
  drawingTitle: string;
  versions: SceneVersion[];
  historyEnabled: boolean;
  onHistoryEnabledChange: (enabled: boolean) => Promise<void>;
  onRestore: (version: SceneVersion) => Promise<void>;
  onClose: () => void;
};

export function HistoryPanel({ drawingPath, drawingTitle, versions, historyEnabled, onHistoryEnabledChange, onRestore, onClose }: HistoryPanelProps) {
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(versions[0]?.id ?? null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedVersion = versions.find((version) => version.id === selectedVersionId) ?? null;

  useEffect(() => {
    setSelectedVersionId(versions[0]?.id ?? null);
  }, [versions]);

  useEffect(() => {
    if (!selectedVersion) {
      setPreviewUrl(null);
      return;
    }

    let cancelled = false;
    setIsLoadingPreview(true);
    setError(null);
    void previewVersion(drawingPath, selectedVersion.id)
      .then((url) => { if (!cancelled) setPreviewUrl(url); })
      .catch((cause) => {
        console.error("Failed to preview drawing version", cause);
        if (!cancelled) {
          setPreviewUrl(null);
          setError("Couldn’t preview this version.");
        }
      })
      .finally(() => { if (!cancelled) setIsLoadingPreview(false); });
    return () => { cancelled = true; };
  }, [drawingPath, selectedVersion]);

  async function restoreSelectedVersion() {
    if (!selectedVersion || isRestoring) {
      return;
    }
    if (!window.confirm(`Restore the ${formatVersionDate(selectedVersion.createdAt)} version of “${drawingTitle}”? Your current canvas will be saved as a new version first.`)) {
      return;
    }

    setIsRestoring(true);
    setError(null);
    try {
      await onRestore(selectedVersion);
    } catch (cause) {
      console.error("Failed to restore drawing version", cause);
      setError("Couldn’t restore this version. Your current canvas is unchanged.");
    } finally {
      setIsRestoring(false);
    }
  }

  return (
    <aside className="history-panel" aria-label="Version history">
      <header>
        <div>
          <p>VERSION HISTORY</p>
          <h2>{drawingTitle}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close version history">×</button>
      </header>
      <label className="history-setting">
        <input
          type="checkbox"
          checked={historyEnabled}
          onChange={(event) => void onHistoryEnabledChange(event.currentTarget.checked)}
        />
        Save recovery versions
      </label>
      {!historyEnabled ? (
        <div className="history-empty">
          <strong>Version history is off</strong>
          <span>Your canvas still autosaves. Turn this on to keep recovery versions for future changes.</span>
        </div>
      ) : !versions.length ? (
        <div className="history-empty">
          <strong>No saved versions yet</strong>
          <span>Versions appear after your next canvas change is autosaved.</span>
        </div>
      ) : (
        <>
          <div className="history-preview">
            {isLoadingPreview ? <span>Loading preview…</span> : previewUrl ? <img src={previewUrl} alt={`Preview of ${formatVersionDate(selectedVersion!.createdAt)}`} /> : <span>Preview unavailable</span>}
          </div>
          <div className="history-version-list" role="listbox" aria-label="Saved versions">
            {versions.map((version) => (
              <button
                key={version.id}
                type="button"
                role="option"
                aria-selected={version.id === selectedVersionId}
                className={version.id === selectedVersionId ? "is-selected" : ""}
                onClick={() => setSelectedVersionId(version.id)}
              >
                <strong>{formatVersionDate(version.createdAt)}</strong>
                <small>{formatByteLength(version.byteLength)}</small>
              </button>
            ))}
          </div>
          {error && <p className="history-error" role="alert">{error}</p>}
          <button className="history-restore" type="button" disabled={!selectedVersion || isRestoring} onClick={() => void restoreSelectedVersion()}>
            {isRestoring ? "Restoring…" : "Restore selected version"}
          </button>
          <p className="history-help">Restoring keeps your current canvas as a new version.</p>
        </>
      )}
    </aside>
  );
}

async function previewVersion(drawingPath: string, versionId: string) {
  const sceneJson = await libraryApi.readSceneVersion(drawingPath, versionId);
  const scene = await loadFromBlob(new Blob([sceneJson], { type: "application/json" }), null, null);
  const svg = await (exportToSvg as unknown as (options: {
    elements: typeof scene.elements;
    appState: { exportBackground: boolean; exportPadding: number; viewBackgroundColor: string };
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
  return svgDataUrl(svg.outerHTML);
}

function svgDataUrl(svg: string) {
  const bytes = new TextEncoder().encode(svg);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

function formatVersionDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);
}

function formatByteLength(byteLength: number) {
  if (byteLength < 1024) return `${byteLength} B`;
  return `${(byteLength / 1024).toFixed(1)} KB`;
}
