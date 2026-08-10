/**
 * Run: node --test lib/import/hash-dedup.test.mjs
 * Mirrors hash/dedup logic without a TS test runner.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

function normText(value) {
  if (value == null) return "";
  return String(value).trim().toLowerCase();
}

function normComment(value) {
  if (value == null) return "";
  return String(value).trim().toLowerCase().replace(/\s+/g, " ");
}

function entryHash(fields) {
  const canonical = [
    normText(fields.person),
    fields.date,
    normText(fields.department),
    normText(fields.role),
    normText(fields.task),
    normText(fields.type),
    normText(fields.billable),
    String(Math.round(fields.loggedMinutes)),
    normComment(fields.comments),
    normText(fields.timeRange),
  ].join("|");
  return createHash("md5").update(canonical, "utf8").digest("hex");
}

function softFingerprint(fields) {
  return [
    normText(fields.person),
    fields.date,
    normText(fields.department),
    normText(fields.role),
    normText(fields.task),
    normText(fields.type),
    normText(fields.billable),
    String(Math.round(fields.loggedMinutes)),
    normComment(fields.comments),
  ].join("|");
}

function toHashFields(row) {
  return {
    person: row.person,
    date: typeof row.date === "string" ? row.date.slice(0, 10) : String(row.date),
    department: row.department,
    role: row.role,
    task: row.task,
    type: row.type,
    billable: row.billable,
    loggedMinutes: Math.round(Number(row.hours) * 60),
    comments: row.comments,
    timeRange: row.source_time_range,
  };
}

function isDuplicateOfExisting(incoming, existing) {
  const incomingHash = entryHash(incoming);
  const existingFields = toHashFields(existing);
  const recomputedExisting = entryHash(existingFields);
  if (
    incomingHash === existing.entry_hash ||
    incomingHash === recomputedExisting
  ) {
    return true;
  }
  if (softFingerprint(incoming) !== softFingerprint(existingFields)) {
    return false;
  }
  const inTime = Boolean(incoming.timeRange && String(incoming.timeRange).trim());
  const exTime = Boolean(
    existing.source_time_range && String(existing.source_time_range).trim()
  );
  if (!inTime || !exTime) return true;
  return (
    String(incoming.timeRange).trim().toLowerCase() ===
    String(existing.source_time_range).trim().toLowerCase()
  );
}

function isUniqueViolation(error) {
  if (!error) return false;
  if (String(error.code ?? "") === "23505") return true;
  const text = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    text.includes("duplicate key") ||
    text.includes("unique constraint") ||
    text.includes("time_entries_entry_hash_key")
  );
}

const base = {
  person: "Ada Lovelace",
  date: "2026-08-01",
  department: "Eng",
  role: "Dev",
  task: "Longhouse",
  type: "Work",
  billable: "Billable",
  loggedMinutes: 45,
  comments: "Title: Foo\nProgram: Arc",
  timeRange: "9:00 a.m. - 9:45 a.m.",
};

describe("entryHash", () => {
  it("collapses comment whitespace", () => {
    const a = entryHash({ ...base, comments: "Title: Foo\nProgram: Arc" });
    const b = entryHash({ ...base, comments: "Title: Foo  Program: Arc" });
    assert.equal(a, b);
  });

  it("round-trips minutes via hours", () => {
    const hours = Math.round((45 / 60) * 10000) / 10000;
    assert.equal(
      entryHash({ ...base, loggedMinutes: Math.round(hours * 60) }),
      entryHash(base)
    );
  });
});

describe("isDuplicateOfExisting", () => {
  it("matches when stored hash is stale but recomputed hash matches", () => {
    const existing = {
      id: 1,
      entry_hash: "stale-v2-hash-not-matching",
      person: base.person,
      date: base.date,
      department: base.department,
      role: base.role,
      task: base.task,
      type: base.type,
      billable: base.billable,
      hours: 0.75,
      comments: base.comments,
      source_time_range: base.timeRange,
      source_file: "export.csv",
      created_at: "2026-08-01T00:00:00Z",
    };
    assert.equal(isDuplicateOfExisting(base, existing), true);
  });

  it("soft-matches legacy rows that lack Time", () => {
    const existing = {
      id: 2,
      entry_hash: null,
      person: base.person,
      date: base.date,
      department: base.department,
      role: base.role,
      task: base.task,
      type: base.type,
      billable: base.billable,
      hours: 0.75,
      comments: base.comments,
      source_time_range: null,
      source_file: "legacy.csv",
      created_at: "2026-08-01T00:00:00Z",
    };
    assert.equal(isDuplicateOfExisting(base, existing), true);
  });
});

describe("isUniqueViolation", () => {
  it("treats entry_hash unique errors as skips", () => {
    assert.equal(
      isUniqueViolation({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "time_entries_entry_hash_key"',
      }),
      true
    );
    assert.equal(
      isUniqueViolation({
        code: "",
        message:
          'duplicate key value violates unique constraint "time_entries_entry_hash_key"',
      }),
      true
    );
    assert.equal(
      isUniqueViolation({ code: "42501", message: "permission denied" }),
      false
    );
  });
});
