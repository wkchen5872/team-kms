"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError(error.message);
    else router.replace("/wikis");
  }

  const input =
    "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/20";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Knowledge Management System
        </p>
        <h1 className="mb-6 mt-1 flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          知識管理系統 <span className="text-border">|</span> Team KMS
        </h1>
        <form onSubmit={onSubmit} className="grid gap-3">
          <input
            className={input}
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            autoFocus
          />
          <input
            className={input}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="mt-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Signing in…" : "登入 Sign in"}
          </button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
      </div>
    </main>
  );
}
