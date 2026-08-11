import { NextResponse } from "next/server";
import { commitImport } from "@/app/import/actions";
import {
  HubAccessError,
  requireHubAccessFromRequest,
} from "@/lib/hub/verifyHubAccess";

export const maxDuration = 300;

function bearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

function intField(form: FormData, key: string): number | undefined {
  const raw = form.get(key);
  if (raw == null) return undefined;
  const n = Number(String(raw));
  return Number.isFinite(n) ? n : undefined;
}

/** Multipart CSV upload — avoids the 1MB Server Actions body limit. */
export async function POST(req: Request) {
  try {
    await requireHubAccessFromRequest(req);
    const token = bearerToken(req);
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ ok: false, error: "Missing CSV file" }, { status: 400 });
    }

    const csvText = await file.text();
    const rejectedCount = intField(form, "rejectedCount") ?? 0;
    const totalRows = intField(form, "totalRows");

    const result = await commitImport(token, csvText, file.name || null, {
      rejectedCount,
      totalRows,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof HubAccessError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Failed to commit import";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
