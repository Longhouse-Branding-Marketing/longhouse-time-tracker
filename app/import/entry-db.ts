import type { ExistingEntryForDedup } from "@/lib/import/dedup";
import { getSupabaseServiceRole } from "@/lib/supabase";

const PAGE = 1000;
/** Keep `.in()` query strings well under common URL limits. */
const HASH_BATCH = 80;

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

/** Exact hash presence check — does not rely on date-range soft matching. */
export async function existingHashSet(hashes: string[]): Promise<Set<string>> {
  const supabase = getSupabaseServiceRole();
  const found = new Set<string>();
  const unique = [...new Set(hashes.filter(Boolean))];

  for (let i = 0; i < unique.length; i += HASH_BATCH) {
    const chunk = unique.slice(i, i + HASH_BATCH);
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
