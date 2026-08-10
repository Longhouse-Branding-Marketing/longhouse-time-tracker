import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  humanizeSupabaseError,
  isRetriableSupabaseAuthError,
} from "./supabase-errors";

export {
  humanizeSupabaseError,
  isRetriableSupabaseAuthError,
} from "./supabase-errors";

let client: SupabaseClient | null = null;
let serviceClient: SupabaseClient | null = null;

const RETRY_DELAYS_MS = [250, 750, 1500, 3000] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Reset cached clients so the next attempt starts clean. */
export function resetSupabaseClients(): void {
  client = null;
  serviceClient = null;
}

/**
 * Retry an async Supabase operation when the failure looks like transient
 * JWT / clock-skew auth noise.
 */
export async function withSupabaseRetry<T>(
  operation: () => Promise<T>
): Promise<T> {
  let lastError: unknown;
  const attempts = RETRY_DELAYS_MS.length + 1;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      const retriable = isRetriableSupabaseAuthError(message);
      if (!retriable || attempt >= RETRY_DELAYS_MS.length) break;
      resetSupabaseClients();
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }

  throw lastError;
}

/**
 * Server-only Supabase client. Reads from the curated `v_*` views.
 * Prefers the service-role / secret key (same privilege path as Import writes)
 * so analytics reads are not gated on anon RLS quirks.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase env vars. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in .env.local."
    );
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

/**
 * Service-role client for base-table writes (time_entries import, etc.).
 * Bypasses RLS. Never expose this key to the browser.
 */
export function getSupabaseServiceRole(): SupabaseClient {
  if (serviceClient) return serviceClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY. Add it to .env.local (Supabase → Project Settings → API → service_role) and restart the dev server. The publishable key cannot insert into time_entries because of row-level security.'
    );
  }

  serviceClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serviceClient;
}

export function hasSupabaseServiceRole(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// The Supabase query builder is heavily generic; we intentionally use a loose
// type here so callers can chain filter/order/range helpers freely.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type QueryShaper = (query: any) => any;

/** Fetch all rows from a view, optionally shaping the query (filters/order). */
export async function fetchView<T>(
  view: string,
  shape?: QueryShaper
): Promise<T[]> {
  return withSupabaseRetry(async () => {
    const supabase = getSupabase();
    const base = supabase.from(view).select("*");
    const query = shape ? shape(base) : base;
    const { data, error } = await query;
    if (error) {
      throw new Error(humanizeSupabaseError(view, error.message));
    }
    return (data ?? []) as T[];
  });
}

/** Fetch the single summary row from a one-row view. */
export async function fetchOne<T>(view: string): Promise<T | null> {
  const rows = await fetchView<T>(view);
  return rows[0] ?? null;
}

/**
 * Fetch every row from a view/table. Uses an exact count on the first page,
 * then loads remaining pages in parallel so large views cost ~2 round-trips
 * instead of N sequential ones.
 *
 * Callers must order by a unique key (or unique composite) so page ranges
 * don't overlap — PostgREST range pagination is unstable when ties exist.
 * Rows with an `id` field are de-duplicated as a safety net.
 */
export async function fetchAll<T>(
  view: string,
  columns = "*",
  shape?: QueryShaper,
  pageSize = 1000
): Promise<T[]> {
  return withSupabaseRetry(async () => {
    const supabase = getSupabase();

    let firstQuery = supabase.from(view).select(columns, { count: "exact" });
    if (shape) firstQuery = shape(firstQuery);
    firstQuery = firstQuery.range(0, pageSize - 1);

    const { data, error, count } = await firstQuery;
    if (error) {
      throw new Error(humanizeSupabaseError(view, error.message));
    }

    const first = (data ?? []) as T[];
    const total = count ?? first.length;
    if (total <= pageSize) return dedupeById(first);

    const pageStarts: number[] = [];
    for (let from = pageSize; from < total; from += pageSize) {
      pageStarts.push(from);
    }

    const rest = await Promise.all(
      pageStarts.map(async (from) => {
        let query = supabase.from(view).select(columns);
        if (shape) query = shape(query);
        query = query.range(from, from + pageSize - 1);
        const { data: batch, error: batchError } = await query;
        if (batchError) {
          throw new Error(humanizeSupabaseError(view, batchError.message));
        }
        return (batch ?? []) as T[];
      })
    );

    return dedupeById(first.concat(...rest));
  });
}

function dedupeById<T>(rows: T[]): T[] {
  if (rows.length === 0) return rows;
  const sample = rows[0] as Record<string, unknown>;
  if (sample == null || typeof sample !== "object" || !("id" in sample)) {
    return rows;
  }

  const seen = new Set<unknown>();
  const out: T[] = [];
  for (const row of rows) {
    const id = (row as Record<string, unknown>).id;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}
