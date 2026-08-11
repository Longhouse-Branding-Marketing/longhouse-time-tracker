import { NextResponse } from "next/server";
import { previewImport } from "@/app/import/actions";
import {
  HubAccessError,
  requireHubAccessFromRequest,
} from "@/lib/hub/verifyHubAccess";

export const maxDuration = 120;

function bearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
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
    const result = await previewImport(token, csvText, file.name || null);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof HubAccessError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Failed to preview import";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
