import { NextResponse } from "next/server";
import { getPeopleBundle } from "@/lib/bundles";
import {
  HubAccessError,
  requireHubAccessFromRequest,
} from "@/lib/hub/verifyHubAccess";

export async function GET(req: Request) {
  try {
    await requireHubAccessFromRequest(req);
    const data = await getPeopleBundle();
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof HubAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Failed to load people";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
