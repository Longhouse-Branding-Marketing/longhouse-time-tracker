/**
 * One-shot: rehash time_entries (v3) and delete soft-duplicate legacy rows
 * (null Time) when a timed counterpart exists.
 *
 * Usage: node --env-file=.env.local scripts/repair-import-duplicates.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function normText(v) {
  return v == null ? "" : String(v).trim().toLowerCase();
}
function normComment(v) {
  return v == null ? "" : String(v).trim().toLowerCase().replace(/\s+/g, " ");
}
function entryHash(f) {
  return createHash("md5")
    .update(
      [
        normText(f.person),
        f.date,
        normText(f.department),
        normText(f.role),
        normText(f.task),
        normText(f.type),
        normText(f.billable),
        String(Math.round(f.loggedMinutes)),
        normComment(f.comments),
        normText(f.timeRange),
      ].join("|"),
      "utf8"
    )
    .digest("hex");
}
function softFingerprint(f) {
  return [
    normText(f.person),
    f.date,
    normText(f.department),
    normText(f.role),
    normText(f.task),
    normText(f.type),
    normText(f.billable),
    String(Math.round(f.loggedMinutes)),
    normComment(f.comments),
  ].join("|");
}
function hasTime(v) {
  return Boolean(v && String(v).trim());
}
function toFields(r) {
  return {
    person: r.person,
    date: r.date,
    department: r.department,
    role: r.role,
    task: r.task,
    type: r.type,
    billable: r.billable,
    loggedMinutes: Math.round(Number(r.hours) * 60),
    comments: r.comments,
    timeRange: r.source_time_range,
  };
}
function scoreSourceFile(_name) {
  return 0;
}
function preferNewer(a, b) {
  const sf = scoreSourceFile(b.source_file) - scoreSourceFile(a.source_file);
  if (sf) return sf;
  const c = String(b.created_at || "").localeCompare(String(a.created_at || ""));
  if (c) return c;
  return b.id - a.id;
}

async function loadAll() {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("time_entries")
      .select(
        "id,entry_hash,person,date,department,role,task,type,billable,hours,comments,source_time_range,source_file,created_at"
      )
      .gte("date", "2026-08-01")
      .lte("date", "2026-08-31")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

function plan(rows) {
  const bySoft = new Map();
  for (const row of rows) {
    const key = softFingerprint(toFields(row));
    const list = bySoft.get(key) || [];
    list.push(row);
    bySoft.set(key, list);
  }
  const deleteIds = [];
  const keepIds = [];
  for (const group of bySoft.values()) {
    if (group.length < 2) continue;
    const timed = group.filter((r) => hasTime(r.source_time_range));
    const untimed = group.filter((r) => !hasTime(r.source_time_range));
    if (timed.length >= 1 && untimed.length >= 1) {
      const keep = [...timed].sort(preferNewer)[0];
      keepIds.push(keep.id);
      for (const u of untimed) deleteIds.push(u.id);
      continue;
    }
    if (untimed.length >= 2 && timed.length === 0) {
      const ranked = [...untimed].sort(preferNewer);
      keepIds.push(ranked[0].id);
      for (const u of ranked.slice(1)) deleteIds.push(u.id);
      continue;
    }
    const byTime = new Map();
    for (const r of timed) {
      const t = String(r.source_time_range).trim().toLowerCase();
      const list = byTime.get(t) || [];
      list.push(r);
      byTime.set(t, list);
    }
    for (const same of byTime.values()) {
      if (same.length < 2) continue;
      const ranked = [...same].sort(preferNewer);
      keepIds.push(ranked[0].id);
      for (const u of ranked.slice(1)) deleteIds.push(u.id);
    }
  }
  return { deleteIds: [...new Set(deleteIds)], keepIds: [...new Set(keepIds)] };
}

const rows = await loadAll();
console.log("loaded", rows.length);

let rehashed = 0;
for (let i = 0; i < rows.length; i += 50) {
  const chunk = rows.slice(i, i + 50);
  await Promise.all(
    chunk.map(async (row) => {
      const next = entryHash(toFields(row));
      if (row.entry_hash === next) return;
      const { error } = await sb
        .from("time_entries")
        .update({ entry_hash: next })
        .eq("id", row.id);
      if (error) throw error;
      row.entry_hash = next;
      rehashed += 1;
    })
  );
}
console.log("rehashed", rehashed);

const { deleteIds, keepIds } = plan(rows);
console.log("soft-dup keep", keepIds.length, "delete", deleteIds.length);
console.log("delete ids", deleteIds);

if (deleteIds.length) {
  for (let i = 0; i < deleteIds.length; i += 100) {
    const chunk = deleteIds.slice(i, i + 100);
    const { error, count } = await sb
      .from("time_entries")
      .delete({ count: "exact" })
      .in("id", chunk);
    if (error) throw error;
    console.log("deleted batch", count ?? chunk.length);
  }
}

// verify
const after = await loadAll();
const { deleteIds: still } = plan(after);
console.log("remaining soft-delete candidates", still.length);
console.log("Aug rows after", after.length);
