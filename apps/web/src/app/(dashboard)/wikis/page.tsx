"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useKBStore } from "@/stores";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

/** KB list + entry point for creating the first knowledge base (the full in-shell
 *  WikiSelector only appears once you're inside a workspace, so the list page needs
 *  its own Create action — otherwise a fresh account has no way in). */
export default function WikisPage() {
  const router = useRouter();
  const kbs = useKBStore((s) => s.knowledgeBases);
  const loading = useKBStore((s) => s.loading);
  const createKB = useKBStore((s) => s.createKB);

  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const kb = await createKB(trimmed);
      setOpen(false);
      setName("");
      router.push(`/wikis/${kb.slug}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create knowledge base");
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="mx-auto h-full w-full max-w-3xl overflow-y-auto px-6 pt-10">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Knowledge Bases</h1>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer"
        >
          <Plus className="size-4" /> New
        </button>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!loading && kbs.length > 0 && (
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
      )}

      {!loading && !kbs.length && (
        <div className="mt-8 flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-12 text-center">
          <p className="text-sm text-muted-foreground">No knowledge bases yet.</p>
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Plus className="size-4" /> Create your first knowledge base
          </button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create knowledge base</DialogTitle>
          </DialogHeader>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="My Research"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            autoFocus
          />
          <DialogFooter>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !name.trim()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 cursor-pointer"
            >
              {creating ? "Creating…" : "Create"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
