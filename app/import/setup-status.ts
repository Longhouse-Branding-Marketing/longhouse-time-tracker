"use server";

import { HubAccessError, requireHubAccessToken } from "@/lib/hub/verifyHubAccess";

export async function getImportSetupStatus(
  accessToken: string | null | undefined
): Promise<{
  serviceRoleConfigured: boolean;
  error?: string;
}> {
  try {
    await requireHubAccessToken(accessToken);
  } catch (err) {
    const message =
      err instanceof HubAccessError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unauthorized";
    return { serviceRoleConfigured: false, error: message };
  }

  const { hasSupabaseServiceRole } = await import("@/lib/supabase");
  return { serviceRoleConfigured: hasSupabaseServiceRole() };
}
