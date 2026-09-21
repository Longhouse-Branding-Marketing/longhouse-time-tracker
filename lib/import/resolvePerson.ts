/**
 * Map a Memtime User string onto employees.person (preferred name).
 *
 * Matching is conservative: exact keys first, then a unique prefix of at
 * least MIN_PREFIX characters. Ambiguous matches leave the CSV value unchanged
 * so Hai/Hailey and Jay/Jayden cannot steal each other's rows.
 */

export type DirectoryPerson = {
  person: string;
  alsoKnownAs?: string[] | null;
};

/** Below this length, prefix matching is skipped (protects Hai, Jay, …). */
export const MIN_PREFIX_LEN = 4;

export function normalizePersonKey(raw: string | null | undefined): string {
  if (raw == null) return "";
  return String(raw).trim().toLowerCase();
}

/** Keys derived from one CSV User cell: full string, email local-part, first word. */
export function userMatchKeys(userRaw: string): string[] {
  const trimmed = userRaw.trim();
  if (!trimmed) return [];
  const lower = normalizePersonKey(trimmed);
  const keys = new Set<string>([lower]);
  if (lower.includes("@")) {
    const local = lower.split("@")[0] ?? "";
    if (local) keys.add(local);
  }
  const first = lower.split(/\s+/)[0] ?? "";
  if (first) keys.add(first);
  return [...keys];
}

/** Keys that identify a directory person: preferred name, aliases, email locals. */
export function directoryKeys(person: DirectoryPerson): string[] {
  const keys = new Set<string>();
  const preferred = normalizePersonKey(person.person);
  if (preferred) keys.add(preferred);

  const first = preferred.split(/\s+/)[0] ?? "";
  if (first) keys.add(first);

  for (const alias of person.alsoKnownAs ?? []) {
    const n = normalizePersonKey(alias);
    if (!n) continue;
    keys.add(n);
    if (n.includes("@")) {
      const local = n.split("@")[0] ?? "";
      if (local) keys.add(local);
    }
    const aliasFirst = n.split(/\s+/)[0] ?? "";
    if (aliasFirst) keys.add(aliasFirst);
  }
  return [...keys];
}

export function asDirectory(
  input: Array<string | DirectoryPerson>
): DirectoryPerson[] {
  return input.map((item) =>
    typeof item === "string" ? { person: item } : item
  );
}

function uniquePerson(hits: DirectoryPerson[]): DirectoryPerson | null {
  const seen = new Map<string, DirectoryPerson>();
  for (const hit of hits) {
    const key = hit.person.trim();
    if (!seen.has(key)) seen.set(key, hit);
  }
  if (seen.size === 1) return [...seen.values()][0];
  return null;
}

/**
 * Resolve Memtime User → preferred employees.person.
 * Returns the original trimmed User when nobody uniquely matches.
 */
export function resolveEmployeeName(
  userRaw: string,
  directoryInput: Array<string | DirectoryPerson>
): string {
  const user = userRaw.trim();
  if (!user) return user;

  const directory = asDirectory(directoryInput).filter((p) =>
    p.person.trim()
  );
  if (directory.length === 0) return user;

  const keyIndex = new Map<string, DirectoryPerson[]>();
  const add = (key: string, person: DirectoryPerson) => {
    if (!key) return;
    const list = keyIndex.get(key) ?? [];
    if (!list.some((p) => p.person.trim() === person.person.trim())) {
      list.push(person);
    }
    keyIndex.set(key, list);
  };
  for (const person of directory) {
    for (const key of directoryKeys(person)) add(key, person);
  }

  const csvKeys = userMatchKeys(user);

  for (const key of csvKeys) {
    const hits = keyIndex.get(key);
    if (!hits || hits.length === 0) continue;
    const unique = uniquePerson(hits);
    if (unique) return unique.person.trim();
    // Ambiguous exact key — do not guess.
    return user;
  }

  const prefixHits: DirectoryPerson[] = [];
  const seen = new Set<string>();
  for (const csvKey of csvKeys) {
    if (csvKey.length < MIN_PREFIX_LEN) continue;
    for (const person of directory) {
      for (const dirKey of directoryKeys(person)) {
        if (dirKey.length < MIN_PREFIX_LEN) continue;
        if (csvKey === dirKey) continue;
        if (!csvKey.startsWith(dirKey) && !dirKey.startsWith(csvKey)) continue;
        const id = person.person.trim();
        if (seen.has(id)) continue;
        seen.add(id);
        prefixHits.push(person);
      }
    }
  }

  if (prefixHits.length === 1) return prefixHits[0].person.trim();
  return user;
}

export function aliasesToRemember(
  sourceUser: string,
  resolvedPerson: string
): string[] {
  const source = sourceUser.trim();
  const resolved = resolvedPerson.trim();
  if (!source) return [];
  if (normalizePersonKey(source) === normalizePersonKey(resolved)) return [];
  return [source];
}

/** Settings textarea: comma or newline separated. */
export function parseAliasInput(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\n,]+/)) {
    const item = part.trim();
    if (!item) continue;
    const key = normalizePersonKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function formatAliasInput(aliases: string[] | null | undefined): string {
  return (aliases ?? []).map((a) => a.trim()).filter(Boolean).join(", ");
}

export function toDirectory(
  employees: Array<{ person: string; also_known_as?: string[] | null }>
): DirectoryPerson[] {
  return employees.map((e) => ({
    person: e.person,
    alsoKnownAs: e.also_known_as ?? [],
  }));
}
