import { useEffect } from 'react'
import { buildHubDeniedUrl } from '../lib/hubRedirect.js'

/**
 * Shown when user is signed in but lacks permission for this tool.
 * Auto-redirects to the Tools Hub after a short delay.
 */
export default function AccessDeniedScreen({
  toolSlug,
  hubUrl,
  redirectDelayMs = 3000,
}) {
  const destination = buildHubDeniedUrl(hubUrl, toolSlug)

  useEffect(() => {
    const timer = setTimeout(() => {
      window.location.href = destination
    }, redirectDelayMs)
    return () => clearTimeout(timer)
  }, [destination, redirectDelayMs])

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-950 px-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white p-8 text-center shadow-2xl">
        <h1 className="text-xl font-semibold text-ink-900">Permissions denied</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-600">
          You don&apos;t have access to this tool. Contact your administrator if you think
          this is a mistake.
        </p>
        <p className="mt-4 text-xs text-ink-500">
          Redirecting you back to Tools in a few seconds…
        </p>
        <a
          href={destination}
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-800"
        >
          Go to Tools now
        </a>
      </div>
    </div>
  )
}
