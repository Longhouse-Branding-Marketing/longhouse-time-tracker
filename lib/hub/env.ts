/** Server + shared hub auth configuration (Tools Supabase project). */

export function getServerSupabaseUrl(): string | undefined {
  return process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
}

export function getServerSupabaseAnonKey(): string | undefined {
  return (
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function getToolSlug(): string {
  return (
    process.env.TOOL_SLUG ??
    process.env.NEXT_PUBLIC_TOOL_SLUG ??
    "time-tracking"
  ).trim();
}

export function getAllowedEmailDomain(): string {
  return (
    process.env.ALLOWED_EMAIL_DOMAIN ??
    process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN ??
    "longhouse.co"
  )
    .trim()
    .toLowerCase();
}

export function getHubUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_HUB_URL ?? process.env.HUB_URL;
}

/** Client-visible hub auth config for ToolAuthGate. */
export function getClientHubAuthConfig() {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    toolSlug: process.env.NEXT_PUBLIC_TOOL_SLUG ?? "time-tracking",
    hubUrl: process.env.NEXT_PUBLIC_HUB_URL ?? "",
    allowedEmailDomain:
      process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN ?? "longhouse.co",
  };
}

export function isHubAuthConfigured(): boolean {
  const c = getClientHubAuthConfig();
  return Boolean(
    c.supabaseUrl && c.supabaseAnonKey && c.toolSlug && c.hubUrl
  );
}
