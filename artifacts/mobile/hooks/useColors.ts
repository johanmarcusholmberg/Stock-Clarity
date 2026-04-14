import { useTheme } from "@/context/ThemeContext";
import colors from "@/constants/colors";

/**
 * Returns the design tokens for the current theme (dark or bright).
 *
 * The theme is user-controlled via the bright-mode toggle in Account settings
 * and persists across sessions. All screens, modals, and overlays derive their
 * colors from this hook — never hardcode palette values directly.
 */
export function useColors() {
  const { theme } = useTheme();
  const palette = theme === "bright" ? colors.bright : colors.light;
  return { ...palette, radius: colors.radius };
}
