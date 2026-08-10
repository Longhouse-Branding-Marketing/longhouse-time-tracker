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
  /** Why this CSV row will be skipped. */
  reason: "in_file" | "already_imported";
};

export type ImportPreviewResult = {
  ok: boolean;
  error?: string;
  totalRows: number;
  validCount: number;
  rejectedCount: number;
  wouldInsert: number;
  wouldSkipDuplicate: number;
  dateMin: string | null;
  dateMax: string | null;
  totalHours: number;
  newHours: number;
  rejected: RejectedRow[];
  rows: TimeEntryInsert[];
  /** Reviewable duplicate CSV rows (may be capped; see duplicatesTotal). */
  duplicates: ImportDuplicateRow[];
  duplicatesTotal: number;
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
