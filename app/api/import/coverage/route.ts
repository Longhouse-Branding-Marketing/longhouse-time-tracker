import { NextResponse } from "next/server";
import { getPersonDailyTracking } from "@/lib/data";
import { computeCompletedDayStatus } from "@/lib/import/completedDay";
import {
  HubAccessError,
  requireHubAccessFromRequest,
} from "@/lib/hub/verifyHubAccess";

export async function GET(req: Request) {
  try {
    await requireHubAccessFromRequest(req);
    const daily = await getPersonDailyTracking();
    const status = computeCompletedDayStatus(daily);
    return NextResponse.json(status);
  } catch (err) {
    if (err instanceof HubAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message =
      err instanceof Error ? err.message : "Failed to load import coverage";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
