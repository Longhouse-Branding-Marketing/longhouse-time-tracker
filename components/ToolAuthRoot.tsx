"use client";

import type { ReactNode } from "react";
import ToolAuthGate from "@/integrations/tool-auth/react/ToolAuthGate.jsx";
import { HubSessionProvider } from "@/lib/hub/HubSessionContext";
import { getClientHubAuthConfig, isHubAuthConfigured } from "@/lib/hub/env";

function ConfigError({ message }: { message: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface px-6">
      <p className="max-w-md text-center text-sm text-muted">{message}</p>
    </div>
  );
}

export function ToolAuthRoot({ children }: { children: ReactNode }) {
  const config = getClientHubAuthConfig();

  if (!isHubAuthConfigured()) {
    return (
      <ConfigError message="Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_TOOL_SLUG, or NEXT_PUBLIC_HUB_URL in .env.local. See .env.example and README." />
    );
  }

  return (
    <ToolAuthGate
      toolSlug={config.toolSlug}
      hubUrl={config.hubUrl}
      supabaseUrl={config.supabaseUrl}
      supabaseAnonKey={config.supabaseAnonKey}
      allowedEmailDomain={config.allowedEmailDomain}
    >
      <HubSessionProvider>{children}</HubSessionProvider>
    </ToolAuthGate>
  );
}
