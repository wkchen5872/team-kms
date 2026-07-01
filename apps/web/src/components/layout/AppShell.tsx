"use client";

import * as React from "react";

/** Fixed viewport-height shell so the workspace (sidebar + main) manages its own
 *  internal scrolling; scrollable pages (KB list, settings) opt into overflow. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return <div className="h-screen overflow-hidden bg-background text-foreground">{children}</div>;
}
