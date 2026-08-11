import type {
  ImportCommitResult,
  ImportPreviewResult,
} from "@/lib/import/import-action-types";

async function postImportForm<T>(
  path: string,
  accessToken: string,
  file: File,
  fields?: Record<string, string | number>
): Promise<T> {
  const form = new FormData();
  form.append("file", file, file.name);
  if (fields) {
    for (const [key, value] of Object.entries(fields)) {
      form.append(key, String(value));
    }
  }

  const res = await fetch(path, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });

  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    const message =
      typeof body.error === "string"
        ? body.error
        : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body;
}

export function previewImportFile(
  accessToken: string,
  file: File
): Promise<ImportPreviewResult> {
  return postImportForm<ImportPreviewResult>("/api/import/preview", accessToken, file);
}

export function commitImportFile(
  accessToken: string,
  file: File,
  meta: { rejectedCount?: number; totalRows?: number }
): Promise<ImportCommitResult> {
  const fields: Record<string, string | number> = {};
  if (meta.rejectedCount != null) fields.rejectedCount = meta.rejectedCount;
  if (meta.totalRows != null) fields.totalRows = meta.totalRows;
  return postImportForm<ImportCommitResult>(
    "/api/import/commit",
    accessToken,
    file,
    fields
  );
}
