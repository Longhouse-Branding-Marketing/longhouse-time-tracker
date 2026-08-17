import type { User } from "@supabase/supabase-js";

function metaString(user: User | null | undefined, key: string): string | null {
  const raw = user?.user_metadata?.[key];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

/** Google OAuth avatar from Supabase user metadata. */
export function sessionUserPhotoUrl(user: User | null | undefined): string | null {
  return metaString(user, "avatar_url") ?? metaString(user, "picture");
}

/** Display name for the signed-in hub user. */
export function sessionUserDisplayName(user: User | null | undefined): string {
  return (
    metaString(user, "full_name") ??
    metaString(user, "name") ??
    user?.email?.split("@")[0] ??
    "Account"
  );
}
