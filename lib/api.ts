"use client";

import { useCallback, useEffect, useState } from "react";
import {
  clearSessionAndRedirectToHub,
  isSessionAuthFailure,
} from "@/integrations/tool-auth/lib/clearSessionAndRedirectToHub.js";
import { getClientHubAuthConfig, getHubUrl } from "@/lib/hub/env";
import { useHubAccessToken } from "@/lib/hub/HubSessionContext";
import { isRetriableSupabaseAuthError } from "@/lib/supabase-errors";

type ApiState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

const cache = new Map<string, Promise<unknown>>();

/** Client-side retries after the server already exhausted its own backoff. */
const CLIENT_RETRY_DELAYS_MS = [800, 2000] as const;

/** Dispatched after `invalidateApiCache` so mounted hooks refetch. */
export const API_CACHE_INVALIDATED = "lh:api-cache-invalidated";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cacheKey(url: string, accessToken: string | null): string {
  return accessToken ? `${url}::${accessToken.slice(0, 12)}` : url;
}

async function loadJson<T>(
  url: string,
  accessToken: string | null
): Promise<T> {
  const headers: HeadersInit = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(url, { headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof body.error === "string"
        ? body.error
        : `Request failed (${res.status})`;
    if (isSessionAuthFailure(res.status, message)) {
      const hub = getHubUrl();
      const auth = getClientHubAuthConfig();
      if (hub) {
        await clearSessionAndRedirectToHub(hub, {
          supabaseUrl: auth.supabaseUrl,
          supabaseAnonKey: auth.supabaseAnonKey,
        });
      }
    }
    throw new Error(message);
  }
  return body as T;
}

async function loadJsonWithAuthRetry<T>(
  url: string,
  accessToken: string | null
): Promise<T> {
  let lastError: unknown;
  const attempts = CLIENT_RETRY_DELAYS_MS.length + 1;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await loadJson<T>(url, accessToken);
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      if (
        !isRetriableSupabaseAuthError(message) ||
        attempt >= CLIENT_RETRY_DELAYS_MS.length
      ) {
        break;
      }
      await sleep(CLIENT_RETRY_DELAYS_MS[attempt]);
    }
  }

  throw lastError;
}

function getApiPromise<T>(url: string, accessToken: string | null): Promise<T> {
  const key = cacheKey(url, accessToken);
  let pending = cache.get(key) as Promise<T> | undefined;
  if (!pending) {
    pending = loadJsonWithAuthRetry<T>(url, accessToken).catch((err) => {
      cache.delete(key);
      throw err;
    });
    cache.set(key, pending);
  }
  return pending;
}

export function invalidateApiCache(url?: string) {
  if (url) {
    for (const key of cache.keys()) {
      if (key === url || key.startsWith(`${url}::`)) cache.delete(key);
    }
  } else {
    cache.clear();
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(API_CACHE_INVALIDATED, { detail: { url: url ?? null } })
    );
  }
}

export function refetchApi<T>(
  url: string,
  accessToken: string | null
): Promise<T> {
  invalidateApiCache(url);
  return getApiPromise<T>(url, accessToken);
}

/**
 * Fetch API data only after hydration. This keeps Supabase and API calls out
 * of React rendering, while the module cache deduplicates repeated routes.
 */
export function useApiData<T>(url: string): ApiState<T> & { refetch: () => void } {
  const accessToken = useHubAccessToken();
  const [state, setState] = useState<ApiState<T>>({ status: "loading" });
  const [version, setVersion] = useState(0);

  const refetch = useCallback(() => {
    invalidateApiCache(url);
    setVersion((current) => current + 1);
  }, [url]);

  useEffect(() => {
    const onInvalidate = (event: Event) => {
      const detail = (event as CustomEvent<{ url: string | null }>).detail;
      if (detail?.url && detail.url !== url) return;
      setVersion((current) => current + 1);
    };
    window.addEventListener(API_CACHE_INVALIDATED, onInvalidate);
    return () => window.removeEventListener(API_CACHE_INVALIDATED, onInvalidate);
  }, [url]);

  useEffect(() => {
    if (!accessToken) {
      setState({ status: "loading" });
      return;
    }

    let active = true;
    setState({ status: "loading" });

    getApiPromise<T>(url, accessToken)
      .then((data) => {
        if (active) setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "Failed to load data",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [url, version, accessToken]);

  return { ...state, refetch };
}

/** Authenticated JSON POST for client components (e.g. Ask AI). */
export function useAuthenticatedFetch() {
  const accessToken = useHubAccessToken();

  return useCallback(
    async (url: string, init: RequestInit = {}) => {
      if (!accessToken) {
        throw new Error("Not signed in");
      }
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${accessToken}`);
      return fetch(url, { ...init, headers });
    },
    [accessToken]
  );
}
