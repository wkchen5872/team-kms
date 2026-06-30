"use client";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { GraphData } from "@/lib/api";

// react-force-graph-2d uses canvas/WebGL → client-only (no SSR).
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

export default function GraphViewer({ data }: { data: GraphData }) {
  const graph = useMemo(
    () => ({
      nodes: data.nodes.map((n) => ({ id: n.id, name: `${n.path}${n.filename}`, type: n.path.startsWith("/wiki/") ? "wiki" : "source" })),
      links: data.edges.map((e) => ({ source: e.source_document_id, target: e.target_document_id, kind: e.reference_type })),
    }),
    [data],
  );

  return (
    <ForceGraph2D
      graphData={graph}
      nodeLabel="name"
      nodeAutoColorBy="type"
      linkColor={() => "#bbb"}
      linkDirectionalArrowLength={4}
    />
  );
}
