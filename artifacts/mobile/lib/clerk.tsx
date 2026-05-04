// Native (iOS/Android) re-export of Clerk hooks/components. The matching
// `clerk.web.tsx` file is picked up by Metro for `--platform web` builds and
// re-exports the same surface from `@clerk/clerk-react`, because @clerk/expo
// pulls in native-only modules (expo-secure-store, expo-apple-authentication,
// the Clerk Expo native module) that can't be bundled for the browser.

import React from "react";
import type { ReactNode } from "react";
import { useAuth as useClerkAuth } from "@clerk/expo";

export {
  ClerkProvider,
  ClerkLoaded,
  useAuth,
  useUser,
  useClerk,
  useOAuth,
} from "@clerk/expo";
export { tokenCache } from "@clerk/expo/token-cache";
export { useSignIn, useSignUp } from "@clerk/expo/legacy";

export function SignedIn({ children }: { children: ReactNode }) {
  const { isSignedIn } = useClerkAuth();
  return isSignedIn ? <>{children}</> : null;
}

export function SignedOut({ children }: { children: ReactNode }) {
  const { isSignedIn } = useClerkAuth();
  return isSignedIn === false ? <>{children}</> : null;
}
