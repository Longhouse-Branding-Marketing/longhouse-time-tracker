import { requireHubAccessToken } from "./verifyHubAccess";

export function hubTokenFromFormData(fd: FormData): string | null {
  const v = fd.get("hubAccessToken");
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

export async function requireAuthFromFormData(fd: FormData) {
  return requireHubAccessToken(hubTokenFromFormData(fd));
}
