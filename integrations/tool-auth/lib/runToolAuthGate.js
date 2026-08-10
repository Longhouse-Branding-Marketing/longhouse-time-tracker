import { isAllowedEmail } from './authUtils.js'
import { checkToolAccess } from './checkAccess.js'
import { createToolSupabase } from './supabase.js'

/**
 * @typedef {'loading' | 'sign_in' | 'denied' | 'domain_rejected' | 'ready' | 'error'} ToolAuthStatus
 */

/**
 * @typedef {Object} ToolAuthGateConfig
 * @property {string} supabaseUrl
 * @property {string} supabaseAnonKey
 * @property {string} toolSlug
 * @property {string} [allowedEmailDomain]
 * @property {boolean} [autoSignIn] - trigger OAuth when no session (default true)
 */

/**
 * @typedef {Object} ToolAuthGateResult
 * @property {ToolAuthStatus} status
 * @property {import('@supabase/supabase-js').Session | null} session
 * @property {import('@supabase/supabase-js').User | null} user
 * @property {string | null} error
 */

/**
 * Run auth + permission gate for an external tool (vanilla JS).
 * Call on boot and on auth state changes.
 *
 * @param {ToolAuthGateConfig} config
 * @returns {Promise<ToolAuthGateResult>}
 */
export async function runToolAuthGate(config) {
  const {
    supabaseUrl,
    supabaseAnonKey,
    toolSlug,
    allowedEmailDomain = 'longhouse.co',
    autoSignIn = true,
  } = config

  const supabase = createToolSupabase({ supabaseUrl, supabaseAnonKey })

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()

  if (sessionError) {
    return {
      status: 'error',
      session: null,
      user: null,
      error: sessionError.message,
    }
  }

  if (!session) {
    if (autoSignIn) {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: {
            hd: allowedEmailDomain,
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      })
      if (oauthError) {
        return {
          status: 'error',
          session: null,
          user: null,
          error: oauthError.message,
        }
      }
    }
    return {
      status: 'sign_in',
      session: null,
      user: null,
      error: null,
    }
  }

  if (!isAllowedEmail(session.user.email, allowedEmailDomain)) {
    await supabase.auth.signOut()
    return {
      status: 'domain_rejected',
      session: null,
      user: null,
      error: `Sign in with your @${allowedEmailDomain} Google Workspace account.`,
    }
  }

  const { allowed, error: accessError } = await checkToolAccess(supabase, toolSlug)

  if (accessError) {
    return {
      status: 'error',
      session,
      user: session.user,
      error: accessError.message ?? 'Could not verify tool access.',
    }
  }

  if (!allowed) {
    return {
      status: 'denied',
      session,
      user: session.user,
      error: null,
    }
  }

  return {
    status: 'ready',
    session,
    user: session.user,
    error: null,
  }
}

/**
 * Subscribe to auth changes and re-run the gate.
 * @param {ToolAuthGateConfig} config
 * @param {(result: ToolAuthGateResult) => void} onResult
 * @returns {() => void} unsubscribe
 */
export function subscribeToolAuthGate(config, onResult) {
  const supabase = createToolSupabase({
    supabaseUrl: config.supabaseUrl,
    supabaseAnonKey: config.supabaseAnonKey,
  })

  let cancelled = false

  async function run() {
    const result = await runToolAuthGate(config)
    if (!cancelled) onResult(result)
  }

  run()

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(() => {
    run()
  })

  return () => {
    cancelled = true
    subscription.unsubscribe()
  }
}
