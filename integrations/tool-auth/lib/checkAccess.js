/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} toolSlug
 * @returns {Promise<{ allowed: boolean, error: import('@supabase/supabase-js').AuthError | import('@supabase/supabase-js').PostgrestError | null }>}
 */
export async function checkToolAccess(supabase, toolSlug) {
  if (!toolSlug?.trim()) {
    return { allowed: false, error: { message: 'Missing tool slug' } }
  }

  const { data, error } = await supabase.rpc('user_can_access_tool_by_slug', {
    p_slug: toolSlug.trim(),
  })

  if (error) {
    return { allowed: false, error }
  }

  return { allowed: Boolean(data), error: null }
}
