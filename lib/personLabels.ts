import {
  MIN_PREFIX_LEN,
  normalizePersonKey,
  resolveEmployeeName,
  toDirectory,
  type DirectoryPerson,
} from "./import/resolvePerson";
import type { Employee, EntryRow } from "./types";

/** Stable key so `Natasha` and `natasha@longhouse.co` share an identity. */
export function personIdentityKey(person: string): string {
  const lower = normalizePersonKey(person);
  if (!lower) return "";
  if (lower.includes("@")) return lower.split("@")[0] ?? lower;
  return lower;
}

/**
 * Prefer real names over email-as-person duplicates in filter dropdowns.
 * Keeps an email only when no non-email label shares its local-part identity.
 */
export function collapsePersonOptions(people: string[]): string[] {
  const unique = Array.from(
    new Set(people.map((value) => value.trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const nonEmail = unique.filter((person) => !person.includes("@"));
  const exactKeys = new Set(nonEmail.map((person) => normalizePersonKey(person)));
  const firstWords = new Set(
    nonEmail
      .map((person) => normalizePersonKey(person).split(/\s+/)[0] ?? "")
      .filter(Boolean)
  );

  return unique.filter((person) => {
    if (!person.includes("@")) return true;
    const local = personIdentityKey(person);
    if (!local) return true;
    if (exactKeys.has(local)) return false;
    if (firstWords.has(local)) return false;
    return true;
  });
}

/** True when `person` matches a selected filter value, including email aliases. */
export function personMatchesSelection(
  person: string,
  selected: ReadonlySet<string>
): boolean {
  if (selected.size === 0) return true;
  if (selected.has(person)) return true;
  const key = personIdentityKey(person);
  if (!key) return false;
  for (const value of selected) {
    if (personIdentityKey(value) === key) return true;
  }
  return false;
}

/**
 * Map a raw entry person onto the preferred directory name, then onto any
 * non-email label already present in the dataset (covers Nick / nick@ pairs
 * when Nick is not yet in employees).
 */
export function normalizeEntryPerson(
  person: string,
  directory: DirectoryPerson[],
  knownLabels: readonly string[]
): string {
  const trimmed = person.trim();
  if (!trimmed) return trimmed;

  const resolved = resolveEmployeeName(trimmed, directory);
  if (normalizePersonKey(resolved) !== normalizePersonKey(trimmed)) {
    return resolved;
  }

  if (!trimmed.includes("@")) return trimmed;

  const local = personIdentityKey(trimmed);
  if (!local) return trimmed;

  const exact = knownLabels.find(
    (label) => !label.includes("@") && normalizePersonKey(label) === local
  );
  if (exact) return exact;

  if (local.length < MIN_PREFIX_LEN) return trimmed;

  const firstHits = knownLabels.filter((label) => {
    if (label.includes("@")) return false;
    const first = normalizePersonKey(label).split(/\s+/)[0] ?? "";
    return first === local;
  });
  if (firstHits.length === 1) return firstHits[0];

  return trimmed;
}

/** Rewrite entry.person onto preferred labels using employees + dataset peers. */
export function normalizeEntriesPeople(
  entries: EntryRow[],
  employees: Employee[]
): EntryRow[] {
  if (entries.length === 0) return entries;

  const directory = toDirectory(employees);
  const known = new Set<string>();
  for (const row of entries) {
    if (row.person?.trim()) known.add(row.person.trim());
  }
  for (const employee of employees) {
    if (employee.person?.trim()) known.add(employee.person.trim());
  }
  const knownLabels = Array.from(known);

  let changed = false;
  const next = entries.map((row) => {
    const person = normalizeEntryPerson(row.person, directory, knownLabels);
    if (person === row.person) return row;
    changed = true;
    return { ...row, person };
  });
  return changed ? next : entries;
}

/** Active-employee rows with person labels normalized onto employees.person. */
export function activeEmployeeEntries(
  entries: EntryRow[],
  employees: Employee[]
): EntryRow[] {
  const normalized = normalizeEntriesPeople(entries, employees);
  const active = new Set(
    employees.filter((employee) => employee.active).map((employee) => employee.person)
  );
  return normalized.filter((row) => active.has(row.person));
}
