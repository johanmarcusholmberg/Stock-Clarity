import { useClerk } from "@/lib/clerk";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useColors } from "@/hooks/useColors";

/**
 * Web-only OAuth callback route.
 *
 * On native, `useOAuth().startOAuthFlow()` consumes the redirect inside
 * `WebBrowser.openAuthSessionAsync` and never navigates the app to this URL.
 * On web, `expo-web-browser` does a full-page redirect to
 * `${origin}/oauth-native-callback` (the default `useOAuth` redirect path),
 * so this route must exist or expo-router serves `+not-found`
 * ("This screen doesn't exist") and the user is stranded after Google sign-in.
 *
 * We hand the URL params to Clerk so it can finish the SSO handshake, then
 * route into the app. `sso-callback.tsx` mirrors this for the newer
 * `useSSO` hook which defaults to `path: 'sso-callback'`.
 */
export default function OAuthNativeCallback() {
  const clerk = useClerk();
  const router = useRouter();
  const colors = useColors();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Available on web; on native this is a no-op since Clerk's session
        // was already activated inside startOAuthFlow before navigation.
        const handle = (clerk as unknown as {
          handleRedirectCallback?: (params: Record<string, unknown>) => Promise<void>;
        }).handleRedirectCallback;
        if (typeof handle === "function") {
          await handle({});
        }
      } catch {
        // Swallow — fall through to home. If auth didn't complete, the
        // (auth) layout will bounce the user back to sign-in.
      }
      if (!cancelled) router.replace("/(tabs)");
    })();
    return () => {
      cancelled = true;
    };
  }, [clerk, router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
