/** Case-insensitive contains: every whitespace-separated token must appear in the option. */
export function matchesContains(option: string, query: string): boolean {
  const haystack = option.toLowerCase();
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every((token) => haystack.includes(token));
}
