"use client";

import * as React from "react";

/** Minimal shell wrapper. Expanded in P4 (sidebar + upload progress panel). */
export function AppShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground">{children}</div>;
}
