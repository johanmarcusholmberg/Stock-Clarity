const colors = {
  // Dark mode — default palette
  light: {
    text: "#FFFFFF",
    tint: "#38BEEB",

    background: "#0A1628",
    foreground: "#FFFFFF",

    card: "#111E33",
    cardForeground: "#FFFFFF",

    primary: "#38BEEB",
    primaryForeground: "#0A1628",

    secondary: "#162038",
    secondaryForeground: "#4F6B5F",

    muted: "#162038",
    mutedForeground: "#4F646B",

    accent: "#EB7438",
    accentForeground: "#FFFFFF",

    destructive: "#FF4757",
    destructiveForeground: "#FFFFFF",

    border: "#1E2F4A",
    input: "#1E2F4A",

    // Semantic: positive stays green, negative stays red — never swapped
    positive: "#3BEBA1",
    negative: "#FF4757",
    warning: "#FFB800",
  },

  // Bright mode — light background palette
  bright: {
    text: "#2F3A40",
    tint: "#38BEEB",

    background: "#F7FAFC",
    foreground: "#2F3A40",

    card: "#FFFFFF",
    cardForeground: "#2F3A40",

    primary: "#38BEEB",
    primaryForeground: "#0A1628",

    secondary: "#EEF3F6",
    secondaryForeground: "#4F646B",

    muted: "#EEF3F6",
    mutedForeground: "#4F646B",

    accent: "#EB7438",
    accentForeground: "#FFFFFF",

    destructive: "#DC2030",
    destructiveForeground: "#FFFFFF",

    border: "#E1E7EB",
    input: "#E1E7EB",

    // Darker shades for readability against light backgrounds.
    // Positive remains distinctly green, negative remains red — never the accent/secondary.
    positive: "#0A8C63",
    negative: "#DC2030",
    warning: "#B85E00",
  },

  radius: 12,
};

export default colors;
