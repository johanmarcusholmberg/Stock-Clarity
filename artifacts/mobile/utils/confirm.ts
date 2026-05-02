import { Alert, Platform } from "react-native";

export interface ConfirmOptions {
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

/**
 * Cross-platform confirmation dialog that returns a boolean.
 *
 * On web, React Native's Alert.alert does not render multi-button dialogs,
 * so taps on the "Confirm" button silently no-op. This helper falls back to
 * the browser's native window.confirm() on web and uses Alert.alert on native.
 */
export function confirmAsync(
  title: string,
  message: string,
  options: ConfirmOptions = {},
): Promise<boolean> {
  const {
    confirmText = "OK",
    cancelText = "Cancel",
    destructive = false,
  } = options;

  if (Platform.OS === "web") {
    if (typeof window === "undefined" || typeof window.confirm !== "function") {
      return Promise.resolve(true);
    }
    const text = message ? `${title}\n\n${message}` : title;
    return Promise.resolve(window.confirm(text));
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: cancelText, style: "cancel", onPress: () => resolve(false) },
      {
        text: confirmText,
        style: destructive ? "destructive" : "default",
        onPress: () => resolve(true),
      },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}
