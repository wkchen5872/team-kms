"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { ArrowLeft, Copy, Moon, Plus, Sun, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { useUserStore } from "@/stores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ApiKey {
  id: string;
  name: string | null;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
}

export default function SettingsPage() {
  const token = useUserStore((s) => s.accessToken);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [keys, setKeys] = React.useState<ApiKey[]>([]);
  const [name, setName] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [newToken, setNewToken] = React.useState<string | null>(null);

  React.useEffect(() => setMounted(true), []);

  const load = React.useCallback(async () => {
    if (!token) return;
    try {
      setKeys(await apiFetch<ApiKey[]>("/v1/api-keys", token));
    } catch {
      /* ignore */
    }
  }, [token]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function createKey() {
    if (!token || creating) return;
    setCreating(true);
    try {
      const created = await apiFetch<ApiKey & { key: string }>("/v1/api-keys", token, {
        method: "POST",
        body: JSON.stringify({ name: name.trim() || undefined }),
      });
      setNewToken(created.key);
      setName("");
      await load();
    } catch {
      toast.error("Failed to create API key");
    } finally {
      setCreating(false);
    }
  }

  async function revokeKey(id: string) {
    if (!token) return;
    try {
      await apiFetch(`/v1/api-keys/${id}`, token, { method: "DELETE" });
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch {
      toast.error("Failed to revoke key");
    }
  }

  return (
    <main className="mx-auto h-full w-full max-w-2xl overflow-y-auto px-6 py-10">
      <Link href="/wikis" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> 返回清單
      </Link>

      <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Preferences &amp; Settings</p>
        <h1 className="mb-8 mt-1 flex items-center gap-3 text-2xl font-extrabold tracking-tight">
          系統設定 <span className="text-border">|</span> Settings
        </h1>

      <section className="mb-8">
        <h2 className="mb-3 border-b border-border pb-2 text-sm font-bold text-foreground">
          <span className="text-muted-foreground">01</span>　外觀模式 <span className="text-muted-foreground">APPEARANCE</span>
        </h2>
        {mounted && (
          <div className="flex items-center justify-between gap-4 rounded-lg bg-secondary px-4 py-3">
            <div className="min-w-0">
              <p className="font-semibold">{theme === "dark" ? "深色主題" : "淺色主題 (標準)"}</p>
              <p className="text-sm text-muted-foreground">
                {theme === "dark"
                  ? "低光度環境的深色介面。點擊右側切換回淺色。"
                  : "使用標準現代的 Light Mode 風格，適合一般日常辦公室高亮度環境。"}
              </p>
            </div>
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title="切換淺色 / 深色"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent-blue px-4 py-2 text-xs font-bold uppercase tracking-wide text-white transition-opacity hover:opacity-90"
            >
              {theme === "dark" ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
              {theme === "dark" ? "Dark Theme Active" : "Light Theme Active"}
            </button>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 border-b border-border pb-2 text-sm font-bold text-foreground">
          <span className="text-muted-foreground">02</span>　外部對接金鑰 <span className="text-muted-foreground">API KEYS</span>
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Create a token to connect Claude via MCP. The token is shown once — copy it now.
        </p>

        <div className="mb-4 flex gap-2">
          <Input placeholder="Key name (optional)" value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
          <Button onClick={createKey} disabled={creating}>
            <Plus className="mr-2 size-4" />
            {creating ? "Creating…" : "Create key"}
          </Button>
        </div>

        {newToken && (
          <div className="mb-4 rounded-md border border-border bg-accent p-3">
            <p className="mb-1 text-xs text-muted-foreground">New token (copy now — won&apos;t be shown again):</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate text-sm">{newToken}</code>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(newToken);
                  toast.success("Copied");
                }}
              >
                <Copy className="size-4" />
              </Button>
            </div>
          </div>
        )}

        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="font-medium">{k.name || "Unnamed"}</span>{" "}
                <code className="text-xs text-muted-foreground">{k.key_prefix}…</code>
                {k.last_used_at && <span className="ml-2 text-xs text-muted-foreground">last used {new Date(k.last_used_at).toLocaleDateString()}</span>}
              </div>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => revokeKey(k.id)}>
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
          {!keys.length && <li className="px-3 py-3 text-sm text-muted-foreground">No API keys yet.</li>}
        </ul>
      </section>
      </div>
    </main>
  );
}
