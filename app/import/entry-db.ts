import type { ExistingEntryForDedup } from "@/lib/import/dedup";
import { getSupabaseServiceRole } from "@/lib/supabase";

const PAGE = 1000;
/** Batches for find_existing_entry_hashes RPC. */
const HASH_BATCH = 400;
const IN_FALLBACK_BATCH = 80;

async function rpcExistingHashes(hashes: string[]): Promise<string[] | null> {
  const supabase = getSupabaseServiceRole();
  const { data, error } = await supabase.rpc("find_existing_entry_hashes", {
    hashes,
  });
  if (error) {
    if (
      error.message.includes("find_existing_entry_hashes") ||
      error.code === "PGRST202"
    ) {
      return null;
    }
    throw new Error(error.message);
  }
  return Array.isArray(data) ? (data as string[]) : [];
}

async function inFilterExistingHashes(hashes: string[]): Promise<Set<string>> {
  const supabase = getSupabaseServiceRole();
  const found = new Set<string>();
  for (let i = 0; i < hashes.length; i += IN_FALLBACK_BATCH) {
    const chunk = hashes.slice(i, i + IN_FALLBACK_BATCH);
    const { data, error } = await supabase
      .from("time_entries")
      .select("entry_hash")
      .in("entry_hash", chunk);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      if (row.entry_hash) found.add(row.entry_hash as string);
    }
  }
  return found;
}

export async function loadExistingInRange(
  from: string,
  to: string
): Promise<ExistingEntryForDedup[]> {
  const supabase = getSupabaseServiceRole();
  const rows: ExistingEntryForDedup[] = [];
  for (let fromIdx = 0; ; fromIdx += PAGE) {
    const { data, error } = await supabase
      .from("time_entries")
      .select(
        "id,entry_hash,person,date,department,role,task,type,billable,hours,comments,source_time_range,source_file,created_at"
      )
      .gte("date", from)
      .lte("date", to)
      .order("id", { ascending: true })
      .range(fromIdx, fromIdx + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as ExistingEntryForDedup[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

export async function countTimeEntries(): Promise<number> {
  const supabase = getSupabaseServiceRole();
  const { count, error } = await supabase
    .from("time_entries")
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Exact hash presence check — does not rely on date-range soft matching. */
export async function existingHashSet(hashes: string[]): Promise<Set<string>> {
  const unique = [...new Set(hashes.filter(Boolean))];
  const found = new Set<string>();
  let rpcAvailable = true;

  for (let i = 0; i < unique.length; i += HASH_BATCH) {
    const chunk = unique.slice(i, i + HASH_BATCH);
    if (rpcAvailable) {
      const existing = await rpcExistingHashes(chunk);
      if (existing === null) {
        rpcAvailable = false;
        return inFilterExistingHashes(unique);
      }
      for (const hash of existing) {
        if (hash) found.add(hash);
      }
    }
  }

  return found;
}
