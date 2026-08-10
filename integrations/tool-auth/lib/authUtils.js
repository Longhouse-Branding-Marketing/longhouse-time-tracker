/**
 * @param {string | null | undefined} email
 * @param {string} domain e.g. "longhouse.co"
 */
export function isAllowedEmail(email, domain) {
  if (!email || typeof email !== 'string') return false
  const normalizedDomain = (domain ?? 'longhouse.co').trim().toLowerCase()
  return email.trim().toLowerCase().endsWith(`@${normalizedDomain}`)
}
