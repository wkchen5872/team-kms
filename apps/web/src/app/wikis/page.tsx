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
    <main className="mx-auto mt-10 w-full max-w-3xl px-6">
      <h1 className="mb-4 text-2xl font-bold">Knowledge Bases</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-white">
        {kbs.map((kb) => (
          <li key={kb.slug} className="px-4 py-3 hover:bg-gray-50">
            <Link href={`/wikis/${kb.slug}`} className="font-medium text-blue-600 hover:underline">
              {kb.name}
            </Link>{" "}
            <code className="text-xs text-gray-400">({kb.slug})</code>
          </li>
        ))}
      </ul>
      {!kbs.length && !error && <p className="mt-4 text-sm text-gray-500">No knowledge bases yet.</p>}
    </main>
  );
}
