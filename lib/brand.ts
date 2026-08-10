// Longhouse brand palette (Brand Guidelines 2025), tuned for light mode.
// Blues lead; semantic colors are used sparingly and supportively.

export const BRAND = {
  ink: "#02163D", // Blue 6 — darkest navy (primary text)
  navy: "#043566", // main palette navy
  brand: "#08447F", // Blue 4 — primary brand blue
  brand600: "#0898CC", // Accent 1 — links / focus chrome
  accentDeep: "#0D8FBE", // KPI numbers / mid chart accents
  accent: "#22BBF2", // Blue 3 — bright cyan (nav / highlights)
  accentSoft: "#C5EBF9", // soft #22BBF2 tint for pale chart fills
  heading: "#235C95", // section / card titles
  blue2: "#1F5B99",
  blue1: "#D5E8F7",
  tint: "#EDF4FA",
  muted: "#5B6B7E",
  line: "#E3EAF2",
  positive: "#1F9D6B",
  review: "#D9A400",
  serious: "#D64545",
  white: "#FFFFFF",
} as const;

// Sequential blue ramp for categorical charts — leads with accentDeep / accent,
// then chroma-true tints & shades (avoid desaturated slate blues).
export const CHART_BLUES = [
  "#0D8FBE",
  "#22BBF2",
  "#0A6F96",
  "#5ECFF5",
  "#1499C9",
  "#8ADEFA",
  "#086080",
  "#48C4F0",
  "#A8E4FB",
  "#0B7A9E",
  "#6FD4F6",
];

export const TONE_COLORS = {
  positive: BRAND.positive,
  neutral: BRAND.brand600,
  review: BRAND.review,
  serious: BRAND.serious,
  info: BRAND.accent,
} as const;
