import { createClient, type User } from "@supabase/supabase-js";
import {
  getAllowedEmailDomain,
  getServerSupabaseAnonKey,
  getServerSupabaseUrl,
  getToolSlug,
} from "./env";

export class HubAccessError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "HubAccessError";
    this.status = status;
  }
}

function isAllowedEmail(email: string | null | undefined, domain: string): boolean {
  if (!email) return false;
  return email.trim().toLowerCase().endsWith(`@${domain}`);
}

async function verifyToken(accessToken: string): Promise<User> {
  const url = getServerSupabaseUrl();
  const anonKey = getServerSupabaseAnonKey();
  if (!url || !anonKey) {
    throw new HubAccessError("Server auth is not configured", 500);
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    throw new HubAccessError("Invalid or expired session", 401);
  }

  const domain = getAllowedEmailDomain();
  if (!isAllowedEmail(user.email, domain)) {
    throw new HubAccessError(
      `Access is restricted to @${domain} Google Workspace accounts`,
      403
    );
  }

  const toolSlug = getToolSlug();
  const { data: allowed, error: accessError } = await supabase.rpc(
    "user_can_access_tool_by_slug",
    { p_slug: toolSlug }
  );

  if (accessError) {
    throw new HubAccessError(
      accessError.message ?? "Could not verify tool access",
      403
    );
  }

  if (!allowed) {
    throw new HubAccessError("Forbidden", 403);
  }

  return user;
}

function bearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

export async function requireHubAccessFromRequest(req: Request): Promise<User> {
  const token = bearerToken(req);
  if (!token) {
    throw new HubAccessError("Missing or invalid Authorization header", 401);
  }
  return verifyToken(token);
}

export async function requireHubAccessToken(
  accessToken: string | null | undefined
): Promise<User> {
  const token = accessToken?.trim();
  if (!token) {
    throw new HubAccessError("Missing or invalid Authorization header", 401);
  }
  return verifyToken(token);
}

export function hubAccessErrorResponse(err: unknown): Response {
  if (err instanceof HubAccessError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : "Request failed";
  return Response.json({ error: message }, { status: 500 });
}
