import { employeeKey, entryHash } from "./hash";
import { cellAt, parseCsv } from "./parseCsv";

/** Physical insert shape for public.time_entries */
export type TimeEntryInsert = {
  person: string;
  date: string;
  hours: number;
  department: string | null;
  role: string | null;
  task: string | null;
  type: string | null;
  billable: string | null;
  comments: string | null;
  source_file: string | null;
  source_row_number: number | null;
  source_month: string | null;
  source_time_range: string | null;
  source_status: string | null;
  entry_hash: string;
  /** Optional FK; set on commit when person matches employees.person. */
  employee_id?: number | null;
};

export type RejectedRow = {
  rowNumber: number;
  reason: string;
};

export type ValidatedImportRow = {
  rowNumber: number;
  insert: TimeEntryInsert;
  /** Preview-only (not inserted). */
  employeeKey: string;
  dayOfWeek: string;
  yearMonth: string;
  loggedMinutes: number;
};

export type ImportParseResult = {
  totalRows: number;
  valid: ValidatedImportRow[];
  rejected: RejectedRow[];
  dateMin: string | null;
  dateMax: string | null;
  /** Sum of valid logged_hours (minutes/60). */
  totalHours: number;
};

type MemtimeCols = {
  user: number;
  /** 1st→department, 2nd→role, 3rd→task (3rd optional / may be -1). */
  bookedOn: [number, number, number];
  loggedTime: number;
  time: number;
  date: number;
  /** -1 when the Activity Type column is absent. */
  activityType: number;
  typeOfLoggedWork: number;
  comment: number | null;
  status: number | null;
};

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function findCol(headers: string[], name: string): number {
  const target = normHeader(name);
  return headers.findIndex((h) => normHeader(h) === target);
}

function findAllCols(headers: string[], name: string): number[] {
  const target = normHeader(name);
  const idxs: number[] = [];
  headers.forEach((h, i) => {
    if (normHeader(h) === target) idxs.push(i);
  });
  return idxs;
}

/**
 * Resolve Memtime columns by header name, preserving "Booked on" columns by
 * position (1st→department, 2nd→role, 3rd→task). The 3rd Booked on and Activity
 * Type columns are optional — some line items leave them blank.
 */
export function resolveMemtimeColumns(
  headers: string[]
): { ok: true; cols: MemtimeCols } | { ok: false; reason: string } {
  const user = findCol(headers, "User");
  const bookedOn = findAllCols(headers, "Booked on");
  const loggedTime = findCol(headers, "Logged Time");
  const time = findCol(headers, "Time");
  const date = findCol(headers, "Date");
  const activityType = findCol(headers, "Activity Type");
  const typeOfLoggedWork = findCol(headers, "Type of Logged Work");
  const comment = findCol(headers, "Comment");
  const status = findCol(headers, "Status");

  const missing: string[] = [];
  if (user < 0) missing.push("User");
  if (bookedOn.length < 2) {
    missing.push(
      `Booked on (need at least 2 columns by position, found ${bookedOn.length})`
    );
  }
  if (loggedTime < 0) missing.push("Logged Time");
  if (time < 0) missing.push("Time");
  if (date < 0) missing.push("Date");
  if (typeOfLoggedWork < 0) missing.push("Type of Logged Work");

  if (missing.length > 0) {
    return {
      ok: false,
      reason: `Not a Memtime export, or missing columns: ${missing.join("; ")}. Found headers: ${headers.join(" | ")}`,
    };
  }

  return {
    ok: true,
    cols: {
      user,
      bookedOn: [bookedOn[0], bookedOn[1], bookedOn[2] ?? -1],
      loggedTime,
      time,
      date,
      activityType,
      typeOfLoggedWork,
      comment: comment >= 0 ? comment : null,
      status: status >= 0 ? status : null,
    },
  };
}

function trimOrNull(value: string): string | null {
  const t = value.trim();
  return t === "" ? null : t;
}

function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return null;
    return s;
  }

  // Memtime often uses DD/MM/YYYY or MM/DD/YYYY — prefer ISO-like and explicit
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) {
    const a = Number(us[1]);
    const b = Number(us[2]);
    const yyyy = us[3];
    // If first part > 12, treat as DD/MM/YYYY; else assume MM/DD/YYYY (US).
    let mm: string;
    let dd: string;
    if (a > 12) {
      dd = String(a).padStart(2, "0");
      mm = String(b).padStart(2, "0");
    } else if (b > 12) {
      mm = String(a).padStart(2, "0");
      dd = String(b).padStart(2, "0");
    } else {
      // Ambiguous: prefer DD/MM when day-first is common in Memtime EU exports;
      // use MM/DD only when first is clearly month-capable and second > 12 already handled.
      // Default MM/DD (existing US-leaning data); callers can normalize.
      mm = String(a).padStart(2, "0");
      dd = String(b).padStart(2, "0");
    }
    const iso = `${yyyy}-${mm}-${dd}`;
    const d = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return null;
    return iso;
  }

  const eu = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (eu) {
    const dd = eu[1].padStart(2, "0");
    const mm = eu[2].padStart(2, "0");
    const yyyy = eu[3];
    const iso = `${yyyy}-${mm}-${dd}`;
    const d = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return null;
    return iso;
  }

  // "Jul 22, 2026" etc.
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

/** Logged Time is minutes in Memtime CSV. */
export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 10000) / 10000;
}

function parseLoggedMinutes(raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  if (Number.isNaN(n) || n < 0) return null;
  return n;
}

function mapBillableLabel(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (v === "billable") return "Billable";
  if (
    v === "non-billable" ||
    v === "nonbillable" ||
    v === "non billable"
  ) {
    return "Non-Billable";
  }
  return raw.trim();
}

const DOW = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function dayOfWeek(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return DOW[d.getUTCDay()] ?? "";
}

/**
 * Map Memtime "User" onto employees.person when possible.
 * There is no email/employee_key column — match display names (and simple
 * email-local / first-token fallbacks against the directory).
 */
export function resolveEmployeeName(
  userRaw: string,
  employeeNames: string[]
): string {
  const user = userRaw.trim();
  if (!user) return user;

  const byLower = new Map(
    employeeNames.map((p) => [p.trim().toLowerCase(), p.trim()] as const)
  );
  const exact = byLower.get(user.toLowerCase());
  if (exact) return exact;

  if (user.includes("@")) {
    const local = user.split("@")[0]?.toLowerCase() ?? "";
    for (const [key, person] of byLower) {
      const slug = key.replace(/[^a-z0-9]/g, "");
      const localSlug = local.replace(/[^a-z0-9]/g, "");
      if (localSlug && (slug === localSlug || slug.startsWith(localSlug))) {
        return person;
      }
    }
  }

  // "Harry Smith" → Harry when directory uses first names
  const first = user.split(/\s+/)[0]?.toLowerCase();
  if (first && byLower.has(first)) return byLower.get(first)!;

  return user;
}

export type ParseMemtimeOptions = {
  sourceFile?: string | null;
  /** employees.person values for User → display name resolution */
  employeeNames?: string[];
};

/**
 * Parse a raw Memtime CSV into validated time_entries insert rows.
 */
export function parseMemtimeCsv(
  csvText: string,
  options: ParseMemtimeOptions | string | null = {}
): ImportParseResult {
  const opts: ParseMemtimeOptions =
    typeof options === "string" || options == null
      ? { sourceFile: options }
      : options;
  const sourceFile = opts.sourceFile ?? null;
  const employeeNames = opts.employeeNames ?? [];

  const { headers, rows } = parseCsv(csvText);
  if (headers.length === 0) {
    return {
      totalRows: 0,
      valid: [],
      rejected: [{ rowNumber: 0, reason: "CSV is empty or missing a header row" }],
      dateMin: null,
      dateMax: null,
      totalHours: 0,
    };
  }

  const resolved = resolveMemtimeColumns(headers);
  if (!resolved.ok) {
    return {
      totalRows: rows.length,
      valid: [],
      rejected: [{ rowNumber: 0, reason: resolved.reason }],
      dateMin: null,
      dateMax: null,
      totalHours: 0,
    };
  }
  const cols = resolved.cols;

  const valid: ValidatedImportRow[] = [];
  const rejected: RejectedRow[] = [];
  let dateMin: string | null = null;
  let dateMax: string | null = null;
  let totalHours = 0;

  rows.forEach((cells, idx) => {
    const rowNumber = idx + 2;

    const userRaw = cellAt(cells, cols.user);
    const department = trimOrNull(cellAt(cells, cols.bookedOn[0]));
    const role = trimOrNull(cellAt(cells, cols.bookedOn[1]));
    const task = trimOrNull(cellAt(cells, cols.bookedOn[2]));
    const type = trimOrNull(cellAt(cells, cols.activityType));
    const billableRaw = cellAt(cells, cols.typeOfLoggedWork);
    const billable = mapBillableLabel(billableRaw);
    const comments = trimOrNull(cellAt(cells, cols.comment ?? -1));
    const timeRange = trimOrNull(cellAt(cells, cols.time));
    const status = trimOrNull(cellAt(cells, cols.status ?? -1));
    const dateRaw = cellAt(cells, cols.date);
    const minutesRaw = cellAt(cells, cols.loggedTime);

    if (!userRaw.trim()) {
      rejected.push({ rowNumber, reason: "Missing User" });
      return;
    }
    const person = resolveEmployeeName(userRaw, employeeNames);

    const date = parseDate(dateRaw);
    if (!date) {
      rejected.push({ rowNumber, reason: `Invalid Date: "${dateRaw}"` });
      return;
    }

    const loggedMinutes = parseLoggedMinutes(minutesRaw);
    if (loggedMinutes == null) {
      rejected.push({
        rowNumber,
        reason: `Invalid Logged Time (minutes): "${minutesRaw}"`,
      });
      return;
    }

    const hours = minutesToHours(loggedMinutes);
    const hash = entryHash({
      person,
      date,
      department,
      role,
      task,
      type,
      billable,
      loggedMinutes,
      comments,
      timeRange,
    });

    const insert: TimeEntryInsert = {
      person,
      date,
      hours,
      department,
      role,
      task,
      type,
      billable,
      comments,
      source_file: sourceFile,
      source_row_number: rowNumber,
      source_month: date.slice(0, 7),
      source_time_range: timeRange,
      source_status: status ?? "imported",
      entry_hash: hash,
    };

    valid.push({
      rowNumber,
      insert,
      employeeKey: employeeKey(person),
      dayOfWeek: dayOfWeek(date),
      yearMonth: date.slice(0, 7),
      loggedMinutes,
    });

    totalHours += hours;
    if (!dateMin || date < dateMin) dateMin = date;
    if (!dateMax || date > dateMax) dateMax = date;
  });

  return {
    totalRows: rows.length,
    valid,
    rejected,
    dateMin,
    dateMax,
    totalHours: Math.round(totalHours * 10000) / 10000,
  };
}
