// Connectivity check: mirrors how the app reads views/tables at runtime.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l && !l.trimStart().startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error(
    "Missing SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or SERVICE_ROLE_KEY) in .env.local"
  );
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

// App-facing views (lib/data.ts) + supporting aggregate views in public.
const views = [
  "v_time_entries_clean",
  "v_operations_kpi",
  "v_person_daily_tracking",
  "v_home_summary",
  "v_time_by_department",
  "v_time_by_month",
  "v_time_by_person",
  "v_time_by_role",
  "v_time_by_task",
  "v_time_by_type",
];

// Settings tables the app also reads (may be empty).
const tables = ["employees", "employee_schedules", "time_off", "stat_holidays"];

let ok = true;

for (const v of [...views, ...tables]) {
  const { error, count } = await supabase
    .from(v)
    .select("*", { count: "exact", head: true });
  if (error) {
    ok = false;
    console.log(`FAIL ${v}: ${error.message}`);
  } else {
    console.log(`ok   ${v}: ${count ?? 0} rows`);
  }
}

// Confirm base time_entries is locked for the publishable key (RLS deny/empty).
if (!env.SUPABASE_SERVICE_ROLE_KEY) {
  const { data: locked, error: lockErr } = await supabase
    .from("time_entries")
    .select("id")
    .limit(1);
  const readable = !lockErr && (locked?.length ?? 0) > 0;
  if (readable) {
    ok = false;
    console.log(
      `base table "time_entries" via publishable key -> ${locked.length} rows readable (unexpected — check RLS)`
    );
  } else {
    console.log(
      `base table "time_entries" via publishable key -> blocked${
        lockErr ? " (" + lockErr.message + ")" : " (RLS empty)"
      }`
    );
  }
}

process.exit(ok ? 0 : 1);
