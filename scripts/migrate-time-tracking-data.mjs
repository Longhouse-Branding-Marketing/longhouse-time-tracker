// Copy legacy time-tracking rows into the Tools Hub Supabase project.
// Prerequisites:
//   1. Apply supabase/migrations/006_hub_time_tracking_schema.sql + views.sql + 001–005 on Hub.
//   2. Set LEGACY_* and Hub SUPABASE_SERVICE_ROLE_KEY in .env.local.
//
// Usage: node --env-file=.env.local scripts/migrate-time-tracking-data.mjs

import { createClient } from "@supabase/supabase-js";

const PAGE = 1000;

const TABLES = [
  "employees",
  "stat_holidays",
  "employee_schedules",
  "time_off",
  "time_entries",
];

function env(name) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function optional(name) {
  return process.env[name]?.trim() || null;
}

async function fetchAll(supabase, table) {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table} read: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function insertBatches(supabase, table, rows) {
  if (!rows.length) {
    console.log(`skip ${table} (0 rows)`);
    return;
  }
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await supabase.from(table).upsert(chunk, {
      onConflict: "id",
    });
    if (error) throw new Error(`${table} upsert: ${error.message}`);
    process.stdout.write(`  ${table}: ${Math.min(i + 200, rows.length)}/${rows.length}\r`);
  }
  console.log(`ok ${table}: ${rows.length} rows`);
}

async function main() {
  const legacyUrl = optional("LEGACY_SUPABASE_URL") ?? optional("OLD_SUPABASE_URL");
  const legacyKey =
    optional("LEGACY_SUPABASE_SERVICE_ROLE_KEY") ??
    optional("OLD_SUPABASE_SERVICE_ROLE_KEY");
  const hubUrl = env("SUPABASE_URL");
  const hubKey = env("SUPABASE_SERVICE_ROLE_KEY");

  if (!legacyUrl || !legacyKey) {
    throw new Error(
      "Set LEGACY_SUPABASE_URL and LEGACY_SUPABASE_SERVICE_ROLE_KEY for the old project."
    );
  }

  const legacy = createClient(legacyUrl, legacyKey, {
    auth: { persistSession: false },
  });
  const hub = createClient(hubUrl, hubKey, {
    auth: { persistSession: false },
  });

  console.log("Migrating time-tracking data to Hub Supabase…");
  for (const table of TABLES) {
    const rows = await fetchAll(legacy, table);
    await insertBatches(hub, table, rows);
  }

  console.log("Done. Run: node --env-file=.env.local scripts/verify-supabase.mjs");
  console.log(
    "If imports fail with time_entries_pkey, run supabase/migrations/011_reset_identity_sequences.sql on Hub."
  );
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
