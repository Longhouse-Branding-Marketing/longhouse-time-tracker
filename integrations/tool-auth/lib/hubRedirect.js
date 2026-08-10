/**
 * Build hub URL with ?denied= slug so the hub can show feedback.
 * @param {string} hubUrl e.g. "https://tools.longhouse.co"
 * @param {string} toolSlug
 */
export function buildHubDeniedUrl(hubUrl, toolSlug) {
  const base = (hubUrl ?? '').replace(/\/$/, '')
  if (!base) return '/'
  const url = new URL(base)
  if (toolSlug) {
    url.searchParams.set('denied', toolSlug)
  }
  return url.toString()
}
