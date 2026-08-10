/**
 * Minimal RFC4180-ish CSV parser (quoted fields, commas, newlines in quotes).
 * First row is headers. Duplicate header names are preserved in order.
 */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    if (row.length === 1 && row[0] === "" && records.length > 0) {
      row = [];
      return;
    }
    records.push(row);
    row = [];
  };

  const src = text.replace(/^\uFEFF/, "");
  while (i < src.length) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (c === "\r") {
      i += 1;
      continue;
    }
    if (c === "\n") {
      pushField();
      pushRow();
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }

  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }

  if (records.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = records[0].map((h) => h.trim());
  const rows = records
    .slice(1)
    .filter((r) => r.some((cell) => cell.trim() !== ""));
  return { headers, rows };
}

export function cellAt(row: string[], index: number | undefined): string {
  if (index == null || index < 0) return "";
  return row[index] ?? "";
}
