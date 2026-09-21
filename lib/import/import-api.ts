import type {
  ImportCommitResult,
  ImportPreviewResult,
  ImportProgressEvent,
} from "@/lib/import/import-action-types";
import { readImportCommitStream } from "@/lib/import/import-stream";

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

export async function commitImportFile(
  accessToken: string,
  file: File,
  meta: { rejectedCount?: number; totalRows?: number },
  onProgress?: (event: ImportProgressEvent) => void
): Promise<ImportCommitResult> {
  const form = new FormData();
  form.append("file", file, file.name);
  if (meta.rejectedCount != null) form.append("rejectedCount", String(meta.rejectedCount));
  if (meta.totalRows != null) form.append("totalRows", String(meta.totalRows));

  const res = await fetch("/api/import/commit", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream") && res.body) {
    if (!res.ok) {
      throw new Error(`Request failed (${res.status})`);
    }
    return readImportCommitStream(res, onProgress);
  }

  const body = (await res.json().catch(() => ({}))) as ImportCommitResult & {
    error?: string;
  };
  if (!res.ok) {
    const message =
      typeof body.error === "string"
        ? body.error
        : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body;
}
