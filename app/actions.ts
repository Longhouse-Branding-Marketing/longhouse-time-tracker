"use server";

import { revalidateTag } from "next/cache";
import { TIME_TRACKING_TAG } from "@/lib/cache-tags";
import { HubAccessError, requireHubAccessToken } from "@/lib/hub/verifyHubAccess";
import { bustMemoryCache } from "@/lib/memory-cache";

/**
 * Refresh the shared dashboard cache only when explicitly requested.
 * The following page load repopulates it from Supabase.
 */
export async function refreshTimeTrackingData(
  accessToken: string | null | undefined
) {
  try {
    await requireHubAccessToken(accessToken);
  } catch (err) {
    const message =
      err instanceof HubAccessError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unauthorized";
    throw new Error(message);
  }

  bustMemoryCache();
  revalidateTag(TIME_TRACKING_TAG, { expire: 0 });
}
