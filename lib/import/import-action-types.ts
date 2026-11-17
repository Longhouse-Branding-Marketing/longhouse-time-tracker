import type { RejectedRow, TimeEntryInsert } from "./memtime";

export type ImportDuplicateRow = {
  person: string;
  date: string;
  hours: number;
  task: string | null;
  department: string | null;
  role: string | null;
  timeRange: string | null;
  entry_hash: string;
  /**
   * Why this CSV row appears in review:
   * - in_file / already_imported → will be skipped
   * - likely_edited_reexport → overlapping timed block from another file; still imported
   */
  reason: "in_file" | "already_imported" | "likely_edited_reexport";
};

export type ImportPreviewResult = {
  ok: boolean;
  error?: string;
  totalRows: number;
  validCount: number;
  rejectedCount: number;
  wouldInsert: number;
  wouldSkipDuplicate: number;
  /** Rows that look like edited re-exports — listed for review, not auto-skipped. */
  editedReexportCount: number;
  dateMin: string | null;
  dateMax: string | null;
  totalHours: number;
  newHours: number;
  rejected: RejectedRow[];
  rows: TimeEntryInsert[];
  /** Reviewable duplicate CSV rows (may be capped; see duplicatesTotal). */
  duplicates: ImportDuplicateRow[];
  duplicatesTotal: number;
  /** Edited re-export candidates (capped with duplicates list). */
  editedReexports: ImportDuplicateRow[];
  /** Rows in public.time_entries on the server Supabase project (service role). */
  dbTimeEntryCount: number;
  /** Project ref from SUPABASE_URL (e.g. rtwnjmhfcmttterxagge). */
  dbProjectRef: string;
  sample: Array<{
    person: string;
    date: string;
    hours: number;
    task: string | null;
    department: string | null;
    entry_hash: string;
    status: "new" | "duplicate";
  }>;
};

export type ImportCommitResult = {
  ok: boolean;
  error?: string;
  processed: number;
  inserted: number;
  skippedDuplicate: number;
  rejected: number;
  dbTimeEntryCount?: number;
  dbProjectRef?: string;
};

export type ImportProgressPhase = "matching" | "inserting" | "finishing";

export type ImportProgressEvent = {
  phase: ImportProgressPhase;
  done: number;
  total: number;
  label: string;
};

export type ImportStreamEvent =
  | (ImportProgressEvent & { type: "progress" })
  | { type: "complete"; result: ImportCommitResult }
  | { type: "error"; error: string };
