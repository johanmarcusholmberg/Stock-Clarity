import { Feather } from "@expo/vector-icons";
import { useSignIn } from "@clerk/expo";
import { Link, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

export default function SignInScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn, errors, fetchStatus } = useSignIn();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");

  const isLoading = fetchStatus === "fetching";

  const handleSignIn = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { error } = await signIn.password({ emailAddress: email, password });
    if (error) return;

    if (signIn.status === "complete") {
      await signIn.finalize({
        navigate: ({ decorateUrl }) => {
          const url = decorateUrl("/");
          if (url.startsWith("http")) {
            router.replace("/(tabs)");
          } else {
            router.replace("/(tabs)");
          }
        },
      });
    } else if (signIn.status === "needs_client_trust") {
      await signIn.mfa.sendEmailCode();
    }
  };

  const handleVerify = async () => {
    await signIn.mfa.verifyEmailCode({ code: verificationCode });
    if (signIn.status === "complete") {
      await signIn.finalize({
        navigate: () => {
          router.replace("/(tabs)");
        },
      });
    }
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (signIn.status === "needs_client_trust") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.inner, { paddingTop: topPad + 24 }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>Verify your identity</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Enter the verification code sent to your email.
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground }]}
            value={verificationCode}
            placeholder="6-digit code"
            placeholderTextColor={colors.mutedForeground}
            onChangeText={setVerificationCode}
            keyboardType="numeric"
          />
          {errors?.fields?.code && (
            <Text style={[styles.errorText, { color: colors.negative }]}>{errors.fields.code.message}</Text>
          )}
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: isLoading ? 0.6 : 1 }]}
            onPress={handleVerify}
            disabled={isLoading}
          >
            {isLoading ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Verify</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => signIn.mfa.sendEmailCode()}>
            <Text style={[styles.linkText, { color: colors.primary }]}>Resend code</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[styles.inner, { paddingTop: topPad + 16, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoRow}>
          <View style={[styles.logoIcon, { backgroundColor: `${colors.primary}22`, borderColor: `${colors.primary}44` }]}>
            <Feather name="trending-up" size={28} color={colors.primary} />
          </View>
        </View>

        <Text style={[styles.appName, { color: colors.foreground }]}>StockClarify</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>Welcome back</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Sign in to access your watchlist and market insights.
        </Text>

        <View style={styles.formSection}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Email</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground }]}
            value={email}
            placeholder="you@example.com"
            placeholderTextColor={colors.mutedForeground}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {errors?.fields?.identifier && (
            <Text style={[styles.errorText, { color: colors.negative }]}>{errors.fields.identifier.message}</Text>
          )}

          <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 14 }]}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.passwordInput, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground }]}
              value={password}
              placeholder="••••••••"
              placeholderTextColor={colors.mutedForeground}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity
              style={[styles.eyeButton, { backgroundColor: colors.secondary, borderColor: colors.border }]}
              onPress={() => setShowPassword((v) => !v)}
            >
              <Feather name={showPassword ? "eye-off" : "eye"} size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          {errors?.fields?.password && (
            <Text style={[styles.errorText, { color: colors.negative }]}>{errors.fields.password.message}</Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: (!email || !password || isLoading) ? 0.5 : 1 }]}
          onPress={handleSignIn}
          disabled={!email || !password || isLoading}
        >
          {isLoading
            ? <ActivityIndicator color={colors.primaryForeground} />
            : <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Sign in</Text>
          }
        </TouchableOpacity>

        <View style={styles.switchRow}>
          <Text style={[styles.switchText, { color: colors.mutedForeground }]}>Don't have an account? </Text>
          <Link href="/(auth)/sign-up" asChild>
            <TouchableOpacity>
              <Text style={[styles.linkText, { color: colors.primary }]}>Sign up</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { paddingHorizontal: 24 },
  logoRow: { alignItems: "center", marginBottom: 20 },
  logoIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  appName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    marginBottom: 20,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginBottom: 28,
  },
  formSection: { gap: 4 },
  label: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  passwordRow: { flexDirection: "row", gap: 8 },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  eyeButton: {
    width: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButton: {
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 24,
    marginBottom: 16,
  },
  primaryButtonText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  switchText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  linkText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  errorText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
});
