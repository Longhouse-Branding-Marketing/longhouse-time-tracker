"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { createToolSupabase } from "@/integrations/tool-auth/lib/supabase.js";
import { getClientHubAuthConfig } from "./env";

type HubSessionContextValue = {
  session: Session | null;
  accessToken: string | null;
  loading: boolean;
};

const HubSessionContext = createContext<HubSessionContextValue | null>(null);

export function HubSessionProvider({ children }: { children: ReactNode }) {
  const config = getClientHubAuthConfig();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      setLoading(false);
      return undefined;
    }

    const supabase = createToolSupabase({
      supabaseUrl: config.supabaseUrl,
      supabaseAnonKey: config.supabaseAnonKey,
    });

    supabase.auth.getSession().then(({ data: { session: s } }: { data: { session: Session | null } }) => {
      setSession(s);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: string, s: Session | null) => {
      setSession(s);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [config.supabaseAnonKey, config.supabaseUrl]);

  const value = useMemo(
    () => ({
      session,
      accessToken: session?.access_token ?? null,
      loading,
    }),
    [session, loading]
  );

  return (
    <HubSessionContext.Provider value={value}>
      {children}
    </HubSessionContext.Provider>
  );
}

export function useHubSession(): HubSessionContextValue {
  const ctx = useContext(HubSessionContext);
  if (!ctx) {
    throw new Error("useHubSession must be used within HubSessionProvider");
  }
  return ctx;
}

export function useHubAccessToken(): string | null {
  return useHubSession().accessToken;
}

/** Append hub JWT to server action FormData payloads. */
export function appendHubAccessToken(
  fd: FormData,
  accessToken: string | null | undefined
): void {
  if (accessToken) fd.set("hubAccessToken", accessToken);
}

export function useAppendHubAccessToken() {
  const { accessToken } = useHubSession();
  return useCallback(
    (fd: FormData) => appendHubAccessToken(fd, accessToken),
    [accessToken]
  );
}
