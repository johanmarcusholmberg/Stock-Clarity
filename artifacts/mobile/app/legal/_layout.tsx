import { Stack } from "expo-router";
import { useColors } from "@/hooks/useColors";

export default function LegalLayout() {
  const colors = useColors();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.foreground,
        headerTitleStyle: { fontFamily: "Inter_700Bold" },
      }}
    >
      <Stack.Screen name="terms" options={{ title: "Terms of Service" }} />
      <Stack.Screen name="privacy" options={{ title: "Privacy Policy" }} />
    </Stack>
  );
}
