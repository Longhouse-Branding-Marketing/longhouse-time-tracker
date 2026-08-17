import { getClientHubAuthConfig, getToolSlug } from "./env";

const PRODUCTION_TOOLS_HUB = "https://tools.longhouse.co";

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function isLocalHubUrl(url: string | undefined): boolean {
  if (!url) return true;
  return isLocalHost(new URL(url).hostname);
}

/** Origin for profile links back to the Tools Hub. */
export function getToolsHubOrigin(): string {
  const fromEnv = getClientHubAuthConfig().hubUrl?.trim().replace(/\/$/, "");

  const onLocalApp =
    typeof window !== "undefined"
      ? isLocalHost(window.location.hostname)
      : process.env.NODE_ENV === "development" && isLocalHubUrl(fromEnv);

  if (onLocalApp && fromEnv && isLocalHubUrl(fromEnv)) {
    return fromEnv;
  }

  return PRODUCTION_TOOLS_HUB;
}

function hubUrl(params?: Record<string, string>): string {
  const url = new URL(getToolsHubOrigin());
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

export function toolsHubHomeUrl(): string {
  return hubUrl();
}

/** Request Feature tab with tool preselected and submit modal open. */
export function toolsHubFeatureRequestUrl(
  toolSlug: string = getToolSlug()
): string {
  return hubUrl({ view: "features", tool: toolSlug, submit: "1" });
}

/** Submit a bug tab with tool preselected. */
export function toolsHubBugReportUrl(toolSlug: string = getToolSlug()): string {
  return hubUrl({ view: "bugs", tool: toolSlug });
}
