"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, type KnowledgeBase } from "@/lib/api";

export default function WikisPage() {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<KnowledgeBase[]>("/v1/knowledge-bases").then(setKbs).catch((e) => setError(String(e)));
  }, []);

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 24 }}>
      <h1>Knowledge Bases</h1>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <ul>
        {kbs.map((kb) => (
          <li key={kb.slug}>
            <Link href={`/wikis/${kb.slug}`}>{kb.name}</Link> <code>({kb.slug})</code>
          </li>
        ))}
      </ul>
      {!kbs.length && !error && <p>No knowledge bases yet.</p>}
    </main>
  );
}
