/**
 * Auth/JWT failures that are often transient under modest clock skew —
 * especially with new sb_publishable / sb_secret keys, which Supabase
 * transforms into short-lived JWTs on each request.
 */
export function isRetriableSupabaseAuthError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("jwt issued at future") ||
    m.includes("issued at future") ||
    m.includes("jwt expired") ||
    m.includes("token is expired") ||
    m.includes("invalidjwt") ||
    m.includes("pgrst301") ||
    (m.includes("clock") && m.includes("skew")) ||
    m.includes("auth timing issue")
  );
}

export function humanizeSupabaseError(view: string, message: string): string {
  if (isRetriableSupabaseAuthError(message)) {
    return (
      `Temporary auth timing issue talking to Supabase while loading "${view}" ` +
      `(token clock skew). Please try again in a moment.`
    );
  }
  if (message.toLowerCase().includes("invalid api key")) {
    return (
      `Supabase view "${view}" failed: Invalid API key. ` +
      `Check that SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are both from the same ` +
      `Supabase project (Tools Hub), then redeploy. The legacy time-tracking project key will not work on the Hub URL.`
    );
  }
  return `Supabase view "${view}" failed: ${message}`;
}
