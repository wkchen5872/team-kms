"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { useKBStore, useUserStore } from "@/stores";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

/** KB dashboard, aligned to docs/design/default: header + KB cards + create entry. */
export default function WikisPage() {
  const router = useRouter();
  const kbs = useKBStore((s) => s.knowledgeBases);
  const loading = useKBStore((s) => s.loading);
  const createKB = useKBStore((s) => s.createKB);
  const email = useUserStore((s) => s.user?.email);

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
    <main className="mx-auto h-full w-full max-w-6xl overflow-y-auto px-8 pt-10 pb-16">
      {/* ── Header ── */}
      <header className="border-b border-border pb-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Knowledge Management System
            </p>
            <h1 className="mt-1 flex items-center gap-3 text-2xl font-extrabold tracking-tight">
              知識管理系統
              <span className="text-border">|</span>
              <span>Team KMS</span>
            </h1>
            {email && (
              <span className="mt-2 inline-block rounded-md bg-secondary px-2 py-1 text-xs text-muted-foreground">
                User: {email}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">System Status</p>
              <p className="mt-1 flex items-center justify-end gap-1.5 text-sm font-semibold text-success">
                <span className="size-2 rounded-full bg-success" /> ONLINE
              </p>
            </div>
            <Link
              href="/settings"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent transition-colors"
            >
              <SettingsIcon className="size-4" /> 設定 Settings
            </Link>
          </div>
        </div>
      </header>

      {/* ── KB list ── */}
      <section className="mt-8">
        <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          知識庫清單 Knowledge Bases
        </p>

        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {!loading && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {kbs.map((kb) => (
              <Link
                key={kb.id}
                href={`/wikis/${kb.slug}`}
                className="group flex flex-col rounded-xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  KBASE // {kb.slug}
                </p>
                <h2 className="mt-2 text-lg font-bold text-accent-blue group-hover:underline">{kb.name}</h2>
                <div className="mt-auto flex items-center justify-between pt-5">
                  <code className="text-xs text-muted-foreground">slug: {kb.slug}</code>
                  <span className="flex items-center gap-1.5 text-xs font-bold text-success">
                    <span className="size-1.5 rounded-full bg-success" /> READY
                  </span>
                </div>
              </Link>
            ))}

            {/* create card */}
            <button
              onClick={() => setOpen(true)}
              className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground transition-colors hover:border-accent-blue/50 hover:text-foreground min-h-[180px]"
            >
              <Plus className="size-6" />
              <span className="font-bold text-foreground">建立新知識庫</span>
              <span className="text-sm">Create a new knowledge base and sync it with your local files.</span>
            </button>
          </div>
        )}
      </section>

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
