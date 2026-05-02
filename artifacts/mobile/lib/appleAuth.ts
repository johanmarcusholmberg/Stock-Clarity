import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";

export { AppleAuthentication };

export type AppleCredential = {
  identityToken: string;
  fullName: AppleAuthentication.AppleAuthenticationFullName | null;
  email: string | null;
  user: string;
};

export async function isAppleAuthAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function requestAppleCredential(): Promise<AppleCredential> {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  if (!credential.identityToken) {
    throw new Error("Apple did not return an identity token.");
  }
  return {
    identityToken: credential.identityToken,
    fullName: credential.fullName ?? null,
    email: credential.email ?? null,
    user: credential.user,
  };
}

export function isUserCanceledAppleError(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: string }).code;
    return code === "ERR_REQUEST_CANCELED" || code === "ERR_CANCELED";
  }
  return false;
}
