"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiFetch, type GraphData } from "@/lib/api";
import GraphViewer from "@/components/GraphViewer";

export default function GraphPage() {
  const slug = String(useParams().slug);
  const [data, setData] = useState<GraphData | null>(null);

  useEffect(() => {
    apiFetch<GraphData>(`/v1/knowledge-bases/${slug}/graph`).then(setData);
  }, [slug]);

  return (
    <main style={{ padding: 24 }}>
      <Link href={`/wikis/${slug}`}>← back to {slug}</Link>
      <h1>Knowledge Graph</h1>
      {data ? <GraphViewer data={data} /> : <p>Loading graph…</p>}
    </main>
  );
}
