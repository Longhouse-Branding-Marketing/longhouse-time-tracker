import type { RepairHashUpdate } from "./repair-plan";

export type { RepairHashUpdate } from "./repair-plan";

export type RepairDuplicateRow = {
  id: number;
  person: string;
  date: string;
  hours: number;
  task: string | null;
  department: string | null;
  role: string | null;
  timeRange: string | null;
  entry_hash: string | null;
  keepId: number;
  sourceFile: string | null;
};

export type RepairPreviewResult = {
  ok: boolean;
  error?: string;
  from: string;
  to: string;
  wouldRehash: number;
  wouldDelete: number;
  kept: number;
  duplicates: RepairDuplicateRow[];
  duplicatesTotal: number;
};

export type RepairResult = {
  ok: boolean;
  error?: string;
  rehashed: number;
  deleted: number;
  kept: number;
  /** True when apply_import_repair ran in one DB transaction. */
  transactional?: boolean;
};

export type RepairWorkPlan = {
  ok: boolean;
  error?: string;
  from: string;
  to: string;
  updates: RepairHashUpdate[];
  clearHashIds: number[];
  deleteIds: number[];
  kept: number;
  totalSteps: number;
};

export type RepairChunkResult = {
  ok: boolean;
  error?: string;
  processed: number;
};
