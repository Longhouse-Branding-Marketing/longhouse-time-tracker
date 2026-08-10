import { NextResponse } from "next/server";
import { getSettingsBundle } from "@/lib/bundles";
import {
  HubAccessError,
  requireHubAccessFromRequest,
} from "@/lib/hub/verifyHubAccess";

export async function GET(req: Request) {
  try {
    await requireHubAccessFromRequest(req);
    const data = await getSettingsBundle();
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof HubAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Failed to load settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
