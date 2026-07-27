import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from "d3-force";
import { useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent, WheelEvent } from "react";
import type { GraphData } from "../library/api";

type GraphViewProps = {
  graph: GraphData;
  onOpenDrawing: (path: string) => void;
  onClose: () => void;
};

type PositionedNode = GraphData["nodes"][number] & { x?: number; y?: number };
type PositionedLink = { source: string | PositionedNode; target: string | PositionedNode };
type Viewport = { x: number; y: number; scale: number };

const WIDTH = 1000;
const HEIGHT = 650;
const INITIAL_VIEWPORT: Viewport = { x: 0, y: 0, scale: 1 };

export function GraphView({ graph, onOpenDrawing, onClose }: GraphViewProps) {
  const { nodes, links, degrees } = useMemo(() => layoutGraph(graph), [graph]);
  const [query, setQuery] = useState("");
  const [showOrphans, setShowOrphans] = useState(true);
  const [viewport, setViewport] = useState<Viewport>(INITIAL_VIEWPORT);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const panStart = useRef<{ x: number; y: number; viewport: Viewport } | null>(null);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleNodes = nodes.filter((node) =>
    (showOrphans || (degrees.get(node.id) ?? 0) > 0)
    && (!normalizedQuery || node.title.toLowerCase().includes(normalizedQuery) || node.path.toLowerCase().includes(normalizedQuery)),
  );
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const visibleLinks = links.filter((link) => visibleNodeIds.has(nodeId(link.source)) && visibleNodeIds.has(nodeId(link.target)));

  function zoomBy(amount: number) {
    setViewport((current) => ({ ...current, scale: clamp(current.scale + amount, 0.45, 2.5) }));
  }

  function handleWheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    zoomBy(event.deltaY > 0 ? -0.1 : 0.1);
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    panStart.current = { x: event.clientX, y: event.clientY, viewport };
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!panStart.current) {
      return;
    }
    const start = panStart.current;
    setViewport({
      ...start.viewport,
      x: start.viewport.x + (event.clientX - start.x) / start.viewport.scale,
      y: start.viewport.y + (event.clientY - start.y) / start.viewport.scale,
    });
  }

  function stopPanning() {
    panStart.current = null;
  }

  return (
    <section className="graph-view" aria-label="Drawing graph">
      <header className="graph-header">
        <div>
          <p className="dialog-eyebrow">KNOWLEDGE GRAPH</p>
          <h1>Your connected canvases</h1>
        </div>
        <button type="button" onClick={onClose}>Back to library</button>
      </header>

      <div className="graph-surface">
        <div className="graph-search">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Filter drawings" aria-label="Filter graph drawings" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear graph filter">×</button>}
        </div>
        <div className="graph-controls" aria-label="Graph controls">
          <button type="button" onClick={() => zoomBy(0.15)} aria-label="Zoom in">+</button>
          <button type="button" onClick={() => zoomBy(-0.15)} aria-label="Zoom out">−</button>
          <button type="button" onClick={() => setViewport(INITIAL_VIEWPORT)} aria-label="Reset graph view">⌂</button>
          <div className="graph-controls-separator" />
          <label>
            <input type="checkbox" checked={showOrphans} onChange={(event) => setShowOrphans(event.currentTarget.checked)} />
            Show unlinked
          </label>
        </div>
        <div className="graph-stats">{visibleNodes.length} drawings <i /> {visibleLinks.length} links</div>

        {nodes.length ? (
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="img"
            aria-label={`${visibleNodes.length} drawings and ${visibleLinks.length} links`}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopPanning}
            onPointerCancel={stopPanning}
          >
            <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
              <g className="graph-links">
                {visibleLinks.map((link, index) => {
                  const source = link.source as PositionedNode;
                  const target = link.target as PositionedNode;
                  const isHighlighted = hoveredNodeId === source.id || hoveredNodeId === target.id;
                  return <line className={isHighlighted ? "is-highlighted" : ""} key={index} x1={source.x} y1={source.y} x2={target.x} y2={target.y} />;
                })}
              </g>
              <g className="graph-nodes">
                {visibleNodes.map((node) => {
                  const degree = degrees.get(node.id) ?? 0;
                  return (
                    <g
                      className={hoveredNodeId === node.id ? "is-hovered" : ""}
                      key={node.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open ${node.title}`}
                      onClick={() => onOpenDrawing(node.path)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onOpenDrawing(node.path);
                        }
                      }}
                      onMouseEnter={() => setHoveredNodeId(node.id)}
                      onMouseLeave={() => setHoveredNodeId(null)}
                    >
                      <circle cx={node.x} cy={node.y} r={nodeRadius(degree)} style={{ "--node-color": nodeColor(node.path) } as CSSProperties} />
                      <text x={node.x} y={(node.y ?? 0) + nodeRadius(degree) + 19}>{node.title}</text>
                    </g>
                  );
                })}
              </g>
            </g>
          </svg>
        ) : (
          <div className="graph-empty">
            <h1>No drawings yet</h1>
            <p>Create drawings and add portals to see their relationships here.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function layoutGraph(graph: GraphData) {
  const nodes: PositionedNode[] = graph.nodes.map((node) => ({ ...node }));
  const links: PositionedLink[] = graph.edges.map((edge) => ({ source: edge.sourceId, target: edge.targetId }));
  const degrees = new Map<string, number>();
  for (const link of links) {
    const sourceId = nodeId(link.source);
    const targetId = nodeId(link.target);
    degrees.set(sourceId, (degrees.get(sourceId) ?? 0) + 1);
    degrees.set(targetId, (degrees.get(targetId) ?? 0) + 1);
  }
  const simulation = forceSimulation(nodes)
    .force("link", forceLink<PositionedNode, PositionedLink>(links).id((node) => node.id).distance(125).strength(0.8))
    .force("charge", forceManyBody().strength(-430))
    .force("center", forceCenter(WIDTH / 2, HEIGHT / 2))
    .force("collide", forceCollide(55))
    .stop();

  for (let tick = 0; tick < 250; tick += 1) {
    simulation.tick();
  }
  return { nodes, links, degrees };
}

function nodeId(node: string | PositionedNode) {
  return typeof node === "string" ? node : node.id;
}

function nodeRadius(degree: number) {
  return Math.min(27, 10 + Math.sqrt(degree) * 7);
}

function nodeColor(path: string) {
  const colors = ["#a78bfa", "#60a5fa", "#38bdf8", "#34d399", "#fbbf24", "#fb7185"];
  return colors[hash(path) % colors.length];
}

function hash(value: string) {
  return [...value].reduce((total, character) => (total * 31 + character.charCodeAt(0)) >>> 0, 0);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}
