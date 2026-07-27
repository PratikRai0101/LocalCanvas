import type { LayerEntry } from "./layers";

type LayersPanelProps = {
  layers: LayerEntry[];
  onSelect: (id: string) => void;
  onMove: (id: string, direction: "forward" | "backward") => void;
  onSetVisible: (id: string, visible: boolean) => void;
  onSetLocked: (id: string, locked: boolean) => void;
  onClose: () => void;
};

export function LayersPanel({ layers, onSelect, onMove, onSetVisible, onSetLocked, onClose }: LayersPanelProps) {
  return (
    <aside className="layers-panel" aria-label="Layers">
      <header>
        <div>
          <p>CANVAS</p>
          <h2>Layers</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close layers">×</button>
      </header>
      {!layers.length ? (
        <div className="layers-empty">Canvas elements appear here.</div>
      ) : (
        <div className="layers-list" role="list">
          {layers.map((layer) => (
            <div className={`layer-row ${layer.hidden ? "is-hidden" : ""}`} key={layer.id} role="listitem">
              <button className="layer-name" type="button" onClick={() => onSelect(layer.id)} title={layer.label}>
                {layer.label}
              </button>
              <div className="layer-actions">
                <button type="button" onClick={() => onMove(layer.id, "forward")} aria-label={`Bring ${layer.label} forward`} title="Bring forward">↑</button>
                <button type="button" onClick={() => onMove(layer.id, "backward")} aria-label={`Send ${layer.label} backward`} title="Send backward">↓</button>
                <button type="button" onClick={() => onSetVisible(layer.id, layer.hidden)} aria-label={layer.hidden ? `Show ${layer.label}` : `Hide ${layer.label}`} title={layer.hidden ? "Show" : "Hide"}>
                  {layer.hidden ? "◌" : "●"}
                </button>
                <button type="button" onClick={() => onSetLocked(layer.id, !layer.locked)} aria-label={layer.locked ? `Unlock ${layer.label}` : `Lock ${layer.label}`} title={layer.locked ? "Unlock" : "Lock"}>
                  {layer.locked ? "⌑" : "⌕"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
