// Web-only visual constants. Layered on top of useColors() — never imported
// by native code. The font families assume the Google Fonts <link> injected
// from app/_layout.tsx has loaded; system fallbacks cover the loading window.
//
// To swap the typography pairing later, change here and every web component
// inherits the new look. Tickers and numeric values use fontData (mono) so
// columns of figures align without table-style hacks.

export const WebTokens = {
  // Typography
  fontDisplay: "'DM Serif Display', Georgia, serif",
  fontData: "'DM Mono', 'Courier New', monospace",
  fontBody: "'Sora', system-ui, sans-serif",

  // Elevation — subtle layering, not heavy drop shadows
  shadow: {
    sm: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
    md: "0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)",
    lg: "0 12px 32px rgba(0,0,0,0.12), 0 4px 8px rgba(0,0,0,0.06)",
    glow: "0 0 0 3px rgba(56, 190, 235, 0.15)",
  },

  // Transitions
  transition: {
    fast: "all 120ms ease",
    base: "all 180ms ease",
    slow: "all 280ms cubic-bezier(0.4, 0, 0.2, 1)",
  },

  // Chart fill gradient stop opacities
  chartFillOpacity: { top: 0.2, bottom: 0.0 },

  // Tier badge pill colors
  tierBadge: {
    free: { bg: "rgba(75,85,99,0.15)", text: "#6B7280" },
    pro: { bg: "rgba(56,190,235,0.12)", text: "#38BEEB" },
    premium: { bg: "rgba(235,116,56,0.15)", text: "#EB7438" },
  },

  // Layout
  sidebar: {
    width: 220,
    collapsedWidth: 64,
    breakpointDesktop: 1100,
    breakpointTablet: 900,
  },
  topbarHeight: 52,
  contentMaxWidth: 1280,
} as const;

export type Tier = keyof typeof WebTokens.tierBadge;
