import { useEffect, useState } from 'react'
import { subscribeToolAuthGate } from '../lib/runToolAuthGate.js'

/**
 * Hook for custom UIs — same gate logic as ToolAuthGate.
 *
 * @param {Object} config
 * @param {string} config.toolSlug
 * @param {string} [config.supabaseUrl]
 * @param {string} [config.supabaseAnonKey]
 * @param {string} [config.allowedEmailDomain]
 * @param {boolean} [config.autoSignIn]
 */
export function useToolAuth({
  toolSlug,
  supabaseUrl = import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY,
  allowedEmailDomain = import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN ?? 'longhouse.co',
  autoSignIn = false,
}) {
  const [state, setState] = useState({
    status: 'loading',
    session: null,
    user: null,
    error: null,
  })

  useEffect(() => {
    return subscribeToolAuthGate(
      {
        supabaseUrl,
        supabaseAnonKey,
        toolSlug,
        allowedEmailDomain,
        autoSignIn,
      },
      setState,
    )
  }, [supabaseUrl, supabaseAnonKey, toolSlug, allowedEmailDomain, autoSignIn])

  return state
}
