// Web variant of `lib/clerk.tsx`, picked up by Metro when bundling for
// `--platform web`. Re-exports the same surface from `@clerk/clerk-react`
// instead of `@clerk/expo`, which is native-only.

import React from "react";
import type { ReactNode } from "react";
import { ClerkProvider as ReactClerkProvider } from "@clerk/clerk-react";

export {
  ClerkLoaded,
  SignedIn,
  SignedOut,
  useAuth,
  useUser,
  useClerk,
  useSignIn,
  useSignUp,
} from "@clerk/clerk-react";

// `tokenCache` is meaningless on web — @clerk/clerk-react manages session
// persistence via cookies/localStorage. Exposed as `undefined` so callers can
// pass it to ClerkProvider on every platform without a Platform check.
export const tokenCache: undefined = undefined;

interface ClerkProviderProps {
  publishableKey: string;
  proxyUrl?: string;
  // Native-only props are accepted but ignored on web so the consumer code
  // can stay platform-agnostic.
  tokenCache?: unknown;
  children: ReactNode;
}

export function ClerkProvider({ publishableKey, children }: ClerkProviderProps) {
  return (
    <ReactClerkProvider publishableKey={publishableKey}>
      {children}
    </ReactClerkProvider>
  );
}

// `useOAuth` is an Expo-only API. On web, OAuth is normally a redirect-based
// flow (signIn.authenticateWithRedirect). The web sign-in/sign-up screens
// haven't been wired up for that yet, so we expose a stub that returns the
// same shape but throws if anyone actually tries to start a flow. This keeps
// the bundle building; the callers fall back to their existing error UI.
type StartOAuthFlowResult = {
  createdSessionId?: string;
  setActive?: (args: { session: string }) => Promise<void>;
};

export function useOAuth(_options: { strategy: string }) {
  return {
    startOAuthFlow: async (): Promise<StartOAuthFlowResult> => {
      throw new Error(
        "useOAuth is not supported on web. Implement a redirect-based OAuth flow with @clerk/clerk-react instead.",
      );
    },
  };
}
