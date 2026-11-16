import { NextResponse } from "next/server";
import { catalogIssues } from "@/lib/categoryMap";
import { getCategoryCrosswalk, reviewCatalog } from "@/lib/categoryMapData";
import { getEntryComments } from "@/lib/data";
import {
  HubAccessError,
  requireHubAccessFromRequest,
} from "@/lib/hub/verifyHubAccess";

export async function GET(request: Request) {
  try {
    await requireHubAccessFromRequest(request);
    const [crosswalk, comments] = await Promise.all([
      getCategoryCrosswalk(),
      getEntryComments().catch(() => []),
    ]);
    return NextResponse.json({
      comments,
      tasks: crosswalk.tasks,
      departments: crosswalk.departments.map((row) => ({
        oldName: row.oldName,
        newName: row.newName,
      })),
      activityNames: crosswalk.activityTypes.map((row) => row.name),
      catalog: reviewCatalog(crosswalk),
      checks: catalogIssues(crosswalk),
    });
  } catch (err) {
    if (err instanceof HubAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Failed to load review";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
