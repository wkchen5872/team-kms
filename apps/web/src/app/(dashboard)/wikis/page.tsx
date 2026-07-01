"use client";

import Link from "next/link";
import { useKBStore } from "@/stores";

/** KB list. The full in-shell WikiSelector + workspace arrive in P4; this is the
 *  interim entry point during the web rewrite. */
export default function WikisPage() {
  const kbs = useKBStore((s) => s.knowledgeBases);
  const loading = useKBStore((s) => s.loading);

  return (
    <main className="mx-auto h-full w-full max-w-3xl overflow-y-auto px-6 pt-10">
      <h1 className="mb-4 text-2xl font-bold">Knowledge Bases</h1>
      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {kbs.map((kb) => (
          <li key={kb.id} className="px-4 py-3 hover:bg-accent">
            <Link href={`/wikis/${kb.slug}`} className="font-medium text-accent-blue hover:underline">
              {kb.name}
            </Link>{" "}
            <code className="text-xs text-muted-foreground">({kb.slug})</code>
          </li>
        ))}
      </ul>
      {!loading && !kbs.length && <p className="mt-4 text-sm text-muted-foreground">No knowledge bases yet.</p>}
    </main>
  );
}
