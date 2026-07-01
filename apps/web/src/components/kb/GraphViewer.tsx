"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from "react";
import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useUserStore } from "@/stores";
import { apiFetch } from "@/lib/api";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

interface GraphNode {
  id: string;
  title: string;
  description?: string | null;
  path: string;
  file_type: string;
  source_kind: "wiki" | "source" | "asset";
  tags?: string[];
  x?: number;
  y?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  type: "cites" | "links_to";
  page?: number;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface Props {
  kbId: string;
  focusNodeId?: string | null;
  onNavigateToDoc?: (docId: string, sourceKind: string) => void;
}

const NODE_RADIUS = 3.5;
const SOURCE_RADIUS = 2.5;
const NODE_COLOR = "rgba(140, 140, 150, 0.7)";
const NODE_COLOR_CONCEPT = "rgba(120, 120, 140, 0.85)";
const NODE_COLOR_ENTITY = "rgba(155, 140, 130, 0.85)";
const NODE_COLOR_SOURCE = "rgba(140, 140, 150, 0.4)";
const NODE_COLOR_HOVER = "rgba(60, 60, 70, 1)";
const EDGE_COLOR = "rgba(140, 140, 150, 0.18)";
const EDGE_COLOR_HOVER = "rgba(100, 100, 110, 0.5)";

export function GraphViewer({ kbId, focusNodeId, onNavigateToDoc }: Props) {
  const token = useUserStore((s) => s.accessToken);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const graphRef = React.useRef<any>(null);
  const [graphData, setGraphData] = React.useState<GraphData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const hoverNodeRef = React.useRef<GraphNode | null>(null);
  const hoverNeighborsRef = React.useRef<Set<string> | null>(null);
  const [hoverNodeState, setHoverNodeState] = React.useState<GraphNode | null>(null);
  const [mousePos, setMousePos] = React.useState({ x: 0, y: 0 });
  const [dimensions, setDimensions] = React.useState({ width: 0, height: 0 });
  const [showSources, setShowSources] = React.useState(false);

  const fetchGraph = React.useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError(false);
    apiFetch<GraphData>(`/v1/knowledge-bases/${kbId}/graph`, token)
      .then(setGraphData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [kbId, token]);

  React.useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) setDimensions({ width, height });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const forceGraphData = React.useMemo(() => {
    if (!graphData) return { nodes: [] as GraphNode[], links: [] as { source: string; target: string; type: string }[] };
    let relevantNodes = graphData.nodes;
    let relevantEdges = graphData.edges;

    if (focusNodeId) {
      const neighborIds = new Set<string>([focusNodeId]);
      for (const e of graphData.edges) {
        if (e.source === focusNodeId) neighborIds.add(e.target);
        if (e.target === focusNodeId) neighborIds.add(e.source);
      }
      relevantNodes = graphData.nodes.filter((n) => neighborIds.has(n.id));
      relevantEdges = graphData.edges.filter((e) => e.source === focusNodeId || e.target === focusNodeId);
    } else {
      const hubTitles = new Set(["overview", "log"]);
      relevantEdges = relevantEdges.filter((e) => e.type === "links_to");
      relevantNodes = relevantNodes.filter((n) => {
        if (n.source_kind !== "wiki" && !showSources) return false;
        return !hubTitles.has((n.title ?? "").toLowerCase());
      });
    }

    const nodeIds = new Set(relevantNodes.map((n) => n.id));
    return {
      nodes: relevantNodes.map((n) => ({ ...n })),
      links: relevantEdges
        .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
        .map((e) => ({ source: e.source, target: e.target, type: e.type })),
    };
  }, [graphData, showSources, focusNodeId]);

  const handleNodeClick = React.useCallback(
    (node: any) => onNavigateToDoc?.(node.id, node.source_kind),
    [onNavigateToDoc],
  );

  const nodeCanvasObject = React.useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const hovering = hoverNodeRef.current;
      const isHover = hovering?.id === node.id;
      const neighbors = hoverNeighborsRef.current;
      const isFaded = hovering && neighbors && !neighbors.has(node.id);
      const isSource = node.source_kind !== "wiki";
      const radius = isSource ? SOURCE_RADIUS : NODE_RADIUS;
      const p = (node.path || "").toLowerCase();
      const isConcept = p.includes("concepts/");
      const isEntity = p.includes("entities/");
      const color = isHover
        ? NODE_COLOR_HOVER
        : isSource
          ? NODE_COLOR_SOURCE
          : isConcept
            ? NODE_COLOR_CONCEPT
            : isEntity
              ? NODE_COLOR_ENTITY
              : NODE_COLOR;

      ctx.globalAlpha = isFaded ? 0.12 : 1;
      ctx.beginPath();
      ctx.arc(node.x!, node.y!, radius, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      if (globalScale > 1.2 || isHover) {
        const label = node.title ?? "";
        const fontSize = Math.max(10 / globalScale, 2);
        ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = isHover ? "#000" : "rgba(60,60,70,0.8)";
        ctx.fillText(label, node.x!, node.y! + radius + 2);
      }
      ctx.globalAlpha = 1;
    },
    // hoverNodeState churns the ref so ForceGraph repaints on hover change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hoverNodeState],
  );

  const handleNodeHover = React.useCallback(
    (node: any) => {
      hoverNodeRef.current = node;
      if (node && forceGraphData.links.length > 0) {
        const neighbors = new Set<string>([node.id]);
        for (const link of forceGraphData.links) {
          const src = link.source as string | { id: string };
          const tgt = link.target as string | { id: string };
          const srcId = typeof src === "object" ? src.id : src;
          const tgtId = typeof tgt === "object" ? tgt.id : tgt;
          if (srcId === node.id) neighbors.add(tgtId);
          if (tgtId === node.id) neighbors.add(srcId);
        }
        hoverNeighborsRef.current = neighbors;
      } else {
        hoverNeighborsRef.current = null;
      }
      setHoverNodeState(node);
    },
    [forceGraphData.links],
  );

  const handleMouseMove = React.useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  const linkColor = React.useCallback(
    (link: any) => {
      const hovering = hoverNodeRef.current;
      if (hovering) {
        const src = link.source as string | { id: string };
        const tgt = link.target as string | { id: string };
        const srcId = typeof src === "object" ? src.id : src;
        const tgtId = typeof tgt === "object" ? tgt.id : tgt;
        const connected = srcId === hovering.id || tgtId === hovering.id;
        if (!connected) return "rgba(200,200,200,0.04)";
        return EDGE_COLOR_HOVER;
      }
      return EDGE_COLOR;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hoverNodeState],
  );

  const hasEdges = forceGraphData.links.length > 0;
  const hasNodes = forceGraphData.nodes.length > 0;
  const ready = !loading && !error && graphData && hasNodes && hasEdges && dimensions.width > 0;

  React.useEffect(() => {
    const fg = graphRef.current;
    if (!fg) return;
    fg.d3Force("charge")?.strength(-850);
    fg.d3Force("link")?.distance(130).strength(0.07);
    import("d3-force").then(({ forceCollide, forceX, forceY }) => {
      fg.d3Force("collide", forceCollide((node: any) => (node.source_kind !== "wiki" ? SOURCE_RADIUS : NODE_RADIUS) + 2.5).iterations(2));
      fg.d3Force("x", forceX(0).strength(0.03));
      fg.d3Force("y", forceY(0).strength(0.03));
      fg.d3ReheatSimulation();
    });
  }, [forceGraphData, ready]);

  let overlay: React.ReactNode = null;
  if (loading) {
    overlay = <Loader2 className="size-5 animate-spin text-muted-foreground" />;
  } else if (error || !graphData) {
    overlay = <p className="text-sm text-muted-foreground">Failed to load graph data</p>;
  } else if (!hasNodes) {
    overlay = <p className="text-sm text-muted-foreground">No documents to visualize yet</p>;
  } else if (!hasEdges) {
    overlay = (
      <p className="max-w-xs text-center text-sm text-muted-foreground">
        {graphData.nodes.length} document{graphData.nodes.length !== 1 ? "s" : ""} found, but no references have been indexed yet.
      </p>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full w-full bg-background" onMouseMove={handleMouseMove}>
      {overlay ? (
        <div className="absolute inset-0 flex items-center justify-center">{overlay}</div>
      ) : ready ? (
        <>
          <ForceGraph2D
            ref={graphRef}
            width={dimensions.width}
            height={dimensions.height}
            graphData={forceGraphData}
            nodeId="id"
            nodeCanvasObject={nodeCanvasObject}
            nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
              ctx.beginPath();
              ctx.arc(node.x!, node.y!, 5, 0, 2 * Math.PI);
              ctx.fillStyle = color;
              ctx.fill();
            }}
            onNodeHover={handleNodeHover}
            onNodeClick={handleNodeClick}
            linkColor={linkColor}
            linkWidth={0.5}
            linkDirectionalArrowLength={0}
            linkDirectionalArrowRelPos={1}
            backgroundColor="transparent"
            cooldownTicks={220}
            d3AlphaDecay={0.01}
            d3VelocityDecay={0.4}
          />

          <div className="absolute right-3 top-3 flex items-center gap-3 rounded-md border border-border bg-background/80 px-3 py-1.5 text-[10px] text-muted-foreground backdrop-blur-sm">
            <button
              onClick={() => setShowSources((s) => !s)}
              className={`cursor-pointer transition-colors ${showSources ? "text-foreground" : "text-muted-foreground/40 hover:text-muted-foreground"}`}
              title={showSources ? "Hide sources" : "Show sources"}
            >
              Sources
            </button>
          </div>

          {hoverNodeState &&
            (() => {
              const p = hoverNodeState.path.toLowerCase();
              const category =
                hoverNodeState.source_kind !== "wiki"
                  ? "Source"
                  : p.includes("concepts/")
                    ? "Concept"
                    : p.includes("entities/")
                      ? "Entity"
                      : "Page";
              return (
                <div
                  className="pointer-events-none absolute z-10 max-w-72 rounded-md border border-border bg-background/95 px-3 py-2 text-xs backdrop-blur-sm"
                  style={{ left: mousePos.x + 14, top: mousePos.y - 10 }}
                >
                  <p className="font-medium">{hoverNodeState.title}</p>
                  {hoverNodeState.description && <p className="mt-0.5 line-clamp-2 text-muted-foreground">{hoverNodeState.description}</p>}
                  <p className="mt-0.5 text-muted-foreground/50">{category}</p>
                  {hoverNodeState.tags && hoverNodeState.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {hoverNodeState.tags.slice(0, 4).map((tag) => (
                        <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground/50">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
        </>
      ) : null}
    </div>
  );
}
