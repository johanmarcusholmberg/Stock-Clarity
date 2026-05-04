// Adds the global keyboard shortcuts that make the web app feel native:
//   /            focus the page's search input (data-search-target attr)
//   Escape       fires onEscape (typically closes a modal or sheet)
//   Backspace    on a stock detail page, navigates back to Home
// Only active on Platform.OS === 'web'.

import { useEffect } from "react";
import { Platform } from "react-native";
import { router } from "expo-router";

interface Options {
  onEscape?: () => void;
  /** When true, ← / Backspace navigate to /(tabs). Use on stock detail screens only. */
  backOnArrowLeft?: boolean;
}

export function useWebKeyboard({ onEscape, backOnArrowLeft }: Options = {}) {
  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (typeof document === "undefined") return;

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inEditable =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (e.key === "/" && !inEditable) {
        const search = document.querySelector<HTMLInputElement>('[data-search-target="true"]');
        if (search) {
          e.preventDefault();
          search.focus();
        }
      }

      if (e.key === "Escape") {
        onEscape?.();
      }

      if (backOnArrowLeft && !inEditable) {
        if (e.key === "ArrowLeft" || e.key === "Backspace") {
          e.preventDefault();
          if (router.canGoBack()) router.back();
          else router.replace("/(tabs)" as any);
        }
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onEscape, backOnArrowLeft]);
}
