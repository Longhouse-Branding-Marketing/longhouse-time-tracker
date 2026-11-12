import { NextResponse } from "next/server";
import { getPersonDailyTracking, getSchedules } from "@/lib/data";
import { computeCompletedDayStatus } from "@/lib/import/completedDay";
import { applyScheduleHistory } from "@/lib/schedules";
import {
  HubAccessError,
  requireHubAccessFromRequest,
} from "@/lib/hub/verifyHubAccess";

export async function GET(req: Request) {
  try {
    await requireHubAccessFromRequest(req);
    const [daily, schedules] = await Promise.all([
      getPersonDailyTracking(),
      getSchedules(),
    ]);
    const status = computeCompletedDayStatus(
      applyScheduleHistory(daily, schedules)
    );
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
