"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useUserStore, useKBStore } from "@/stores";

/** Bridges Supabase auth into the zustand user store and hydrates the KB list.
 *  Wraps the (dashboard) group; bounces to /login when there is no session. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const setUser = useUserStore((s) => s.setUser);
  const setAccessToken = useUserStore((s) => s.setAccessToken);
  const setAuthLoading = useUserStore((s) => s.setAuthLoading);
  const signOut = useUserStore((s) => s.signOut);
  const fetchKBs = useKBStore((s) => s.fetchKBs);

  React.useEffect(() => {
    let cancelled = false;

    function apply(session: Session | null) {
      if (cancelled) return;
      if (!session) {
        signOut();
        useKBStore.setState({ knowledgeBases: [], loading: false, error: null });
        setAuthLoading(false);
        router.replace("/login");
        return;
      }
      setUser({ id: session.user.id, email: session.user.email ?? "" });
      setAccessToken(session.access_token);
      setAuthLoading(false);
      void fetchKBs();
    }

    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => apply(session));
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [router, setUser, setAccessToken, setAuthLoading, signOut, fetchKBs]);

  return <>{children}</>;
}
