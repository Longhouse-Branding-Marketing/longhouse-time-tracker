import { NextResponse } from "next/server";
import { getEmployee, getOperationsKpis, getPersonEntries } from "@/lib/data";
import {
  HubAccessError,
  requireHubAccessFromRequest,
} from "@/lib/hub/verifyHubAccess";

export async function GET(request: Request) {
  try {
    await requireHubAccessFromRequest(request);
    const person = new URL(request.url).searchParams.get("person")?.trim();
    if (!person) {
      return NextResponse.json({ error: "Person is required" }, { status: 400 });
    }

    const [entries, employee, kpis] = await Promise.all([
      getPersonEntries(person),
      getEmployee(person),
      getOperationsKpis(),
    ]);

    const kpi = kpis.find((row) => row.person === person) ?? null;

    return NextResponse.json({ person, employee, kpi, entries });
  } catch (err) {
    if (err instanceof HubAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message =
      err instanceof Error ? err.message : "Failed to load person entries";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
