// This route handles the OAuth redirect from Clerk after Google/Apple sign-in.
// Clerk redirects here with a token in the URL; we complete the handshake
// and then redirect the user to the app.
import { useEffect } from "react";
import { useRouter } from "expo-router";
import { useClerk } from "@/lib/clerk";
import { ActivityIndicator, View } from "react-native";
import { useColors } from "@/hooks/useColors";

export default function SSOCallback() {
  const { handleRedirectCallback } = useClerk();
  const router = useRouter();
  const colors = useColors();

  useEffect(() => {
    (handleRedirectCallback as Function)({
      afterSignInUrl: "/(tabs)",
      afterSignUpUrl: "/(tabs)",
    }).catch(() => {
      router.replace("/(auth)/sign-in");
    });
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center",
      backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
