import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from "d3-force";
import { useMemo } from "react";
import { GraphData } from "../library/api";

type GraphViewProps = {
  graph: GraphData;
  onOpenDrawing: (path: string) => void;
  onClose: () => void;
};

type PositionedNode = GraphData["nodes"][number] & { x?: number; y?: number };
type PositionedLink = { source: string | PositionedNode; target: string | PositionedNode };

const WIDTH = 900;
const HEIGHT = 600;

export function GraphView({ graph, onOpenDrawing, onClose }: GraphViewProps) {
  const { nodes, links } = useMemo(() => layoutGraph(graph), [graph]);

  return (
    <section className="graph-view" aria-label="Drawing graph">
      <header>
        <div>
          <p className="dialog-eyebrow">DRAWING GRAPH</p>
          <h1>Follow your canvas connections.</h1>
        </div>
        <button type="button" onClick={onClose}>Back to library</button>
      </header>
      {nodes.length ? (
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${nodes.length} drawings and ${links.length} links`}>
          <g className="graph-links">
            {links.map((link, index) => {
              const source = link.source as PositionedNode;
              const target = link.target as PositionedNode;
              return <line key={index} x1={source.x} y1={source.y} x2={target.x} y2={target.y} />;
            })}
          </g>
          <g className="graph-nodes">
            {nodes.map((node) => (
              <g key={node.id} role="button" tabIndex={0} aria-label={`Open ${node.title}`} onClick={() => onOpenDrawing(node.path)} onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenDrawing(node.path);
                }
              }}>
                <circle cx={node.x} cy={node.y} r="24" />
                <text x={node.x} y={(node.y ?? 0) + 42}>{node.title}</text>
              </g>
            ))}
          </g>
        </svg>
      ) : (
        <div className="graph-empty">
          <h1>No drawings yet</h1>
          <p>Create drawings and add portals to see their relationships here.</p>
        </div>
      )}
    </section>
  );
}

function layoutGraph(graph: GraphData) {
  const nodes: PositionedNode[] = graph.nodes.map((node) => ({ ...node }));
  const links: PositionedLink[] = graph.edges.map((edge) => ({ source: edge.sourceId, target: edge.targetId }));
  const simulation = forceSimulation(nodes)
    .force("link", forceLink<PositionedNode, PositionedLink>(links).id((node) => node.id).distance(110).strength(0.8))
    .force("charge", forceManyBody().strength(-320))
    .force("center", forceCenter(WIDTH / 2, HEIGHT / 2))
    .force("collide", forceCollide(48))
    .stop();

  for (let tick = 0; tick < 250; tick += 1) {
    simulation.tick();
  }
  return { nodes, links };
}
