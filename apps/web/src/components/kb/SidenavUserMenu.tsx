"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Settings, LogOut, Moon, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "next-themes";
import { useUserStore } from "@/stores";
import { supabase } from "@/lib/supabase";

export function SidenavUserMenu() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const user = useUserStore((s) => s.user);
  const signOutLocal = useUserStore((s) => s.signOut);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    signOutLocal();
    router.push("/login");
  };

  if (!user) return null;

  const initials = user.email.slice(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <div className="flex size-5 shrink-0 items-center justify-center rounded border border-border bg-muted">
            <span className="text-[8px] font-medium">{initials}</span>
          </div>
          <span className="truncate">{user.email}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-48">
        <DropdownMenuItem onClick={() => router.push("/settings")}>
          <Settings className="mr-2 size-4" />
          Settings
        </DropdownMenuItem>
        {mounted && (
          <DropdownMenuItem onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? (
              <>
                <Sun className="mr-2 size-4" />
                Light Mode
              </>
            ) : (
              <>
                <Moon className="mr-2 size-4" />
                Dark Mode
              </>
            )}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="mr-2 size-4" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
