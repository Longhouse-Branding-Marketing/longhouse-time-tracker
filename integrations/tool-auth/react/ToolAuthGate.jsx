import { useEffect, useState } from 'react'
import { subscribeToolAuthGate } from '../lib/runToolAuthGate.js'
import AccessDeniedScreen from './AccessDeniedScreen.jsx'

function AuthLoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-950 px-6">
      <p className="text-sm font-medium text-brand-200/90">Loading…</p>
    </div>
  )
}

function AuthErrorScreen({ message }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-950 px-6">
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-red-200">{message}</p>
      </div>
    </div>
  )
}

function SignInScreen({ message, onSignIn, signingIn }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-950 px-6">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white p-8 text-center shadow-2xl">
        <h1 className="text-xl font-semibold text-ink-900">Sign in required</h1>
        <p className="mt-2 text-sm text-ink-600">
          {message ?? 'Sign in with your Google Workspace account to continue.'}
        </p>
        <button
          type="button"
          onClick={onSignIn}
          disabled={signingIn}
          className="mt-6 inline-flex w-full items-center justify-center rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm font-medium text-ink-800 shadow-sm transition-colors hover:bg-brand-50 disabled:opacity-55"
        >
          {signingIn ? 'Redirecting…' : 'Continue with Google'}
        </button>
      </div>
    </div>
  )
}

/**
 * Wrap your tool app with this component.
 *
 * @param {Object} props
 * @param {string} props.toolSlug - Must match slug in Tools Hub Manage Tools
 * @param {string} props.hubUrl - Tools Hub URL for denied redirect
 * @param {string} [props.supabaseUrl] - defaults to import.meta.env.VITE_SUPABASE_URL
 * @param {string} [props.supabaseAnonKey] - defaults to import.meta.env.VITE_SUPABASE_ANON_KEY
 * @param {string} [props.allowedEmailDomain] - defaults to import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN or longhouse.co
 * @param {React.ReactNode} props.children
 */
export default function ToolAuthGate({
  toolSlug,
  hubUrl,
  supabaseUrl = import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY,
  allowedEmailDomain = import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN ?? 'longhouse.co',
  children,
}) {
  const [state, setState] = useState({
    status: 'loading',
    session: null,
    user: null,
    error: null,
  })
  const [signingIn, setSigningIn] = useState(false)

  useEffect(() => {
    return subscribeToolAuthGate(
      {
        supabaseUrl,
        supabaseAnonKey,
        toolSlug,
        allowedEmailDomain,
        autoSignIn: false,
      },
      setState,
    )
  }, [supabaseUrl, supabaseAnonKey, toolSlug, allowedEmailDomain])

  async function handleSignIn() {
    setSigningIn(true)
    const { runToolAuthGate } = await import('../lib/runToolAuthGate.js')
    await runToolAuthGate({
      supabaseUrl,
      supabaseAnonKey,
      toolSlug,
      allowedEmailDomain,
      autoSignIn: true,
    })
    setSigningIn(false)
  }

  if (state.status === 'loading' || state.status === 'sign_in') {
    if (state.status === 'sign_in') {
      return (
        <SignInScreen
          message={
            state.error ??
            `Sign in with your @${allowedEmailDomain} Google Workspace account.`
          }
          onSignIn={handleSignIn}
          signingIn={signingIn}
        />
      )
    }
    return <AuthLoadingScreen />
  }

  if (state.status === 'domain_rejected' || state.status === 'error') {
    return <AuthErrorScreen message={state.error ?? 'Authentication failed.'} />
  }

  if (state.status === 'denied') {
    return (
      <AccessDeniedScreen
        toolSlug={toolSlug}
        hubUrl={hubUrl}
        redirectDelayMs={3000}
      />
    )
  }

  return children
}
