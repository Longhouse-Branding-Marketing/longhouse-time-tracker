# Tool auth integration kit

Copy this folder into each external Longhouse tool repo.

## Quick checklist

1. Copy `integrations/tool-auth/` into your tool project.
2. Add env vars from [`.env.example`](.env.example) (same Supabase URL/anon key as the hub).
3. Register the tool in hub **Manage Tools** with matching **slug**, departments, and tiers.
4. Assign users in hub **Manage Access**.
5. Add your tool's origin to Supabase **Redirect URLs** and Google **Authorized JavaScript origins**.
6. Wrap your app (see below).

## React (Vite)

```jsx
import ToolAuthGate from './integrations/tool-auth/react/ToolAuthGate.jsx'

export default function App() {
  return (
    <ToolAuthGate
      toolSlug={import.meta.env.VITE_TOOL_SLUG}
      hubUrl={import.meta.env.VITE_HUB_URL}
    >
      <YourApp />
    </ToolAuthGate>
  )
}
```

Requires `@supabase/supabase-js` (same version as hub).

## Vanilla JS

```js
import { subscribeToolAuthGate } from './integrations/tool-auth/lib/runToolAuthGate.js'
import { buildHubDeniedUrl } from './integrations/tool-auth/lib/hubRedirect.js'

const config = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  toolSlug: import.meta.env.VITE_TOOL_SLUG,
  allowedEmailDomain: import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN,
  autoSignIn: false,
}

subscribeToolAuthGate(config, result => {
  if (result.status === 'sign_in') {
    // show login button; on click run with autoSignIn: true
  } else if (result.status === 'denied') {
    window.location.href = buildHubDeniedUrl(
      import.meta.env.VITE_HUB_URL,
      import.meta.env.VITE_TOOL_SLUG,
    )
  } else if (result.status === 'ready') {
    // mount your app
  }
})
```

## Full walkthrough

See [docs/TOOL_INTEGRATION.md](../../docs/TOOL_INTEGRATION.md) in the hub repo.
