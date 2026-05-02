import { Feather } from "@expo/vector-icons";
import { useSignIn, useSignUp } from "@clerk/expo/legacy";
import { useOAuth } from "@clerk/expo";
import { Link, useRouter, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
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
import {
  AppleAuthentication,
  isAppleAuthAvailable,
  isUserCanceledAppleError,
  requestAppleCredential,
} from "@/lib/appleAuth";

function getClerkErrorMessage(err: unknown, fallback: string): string {
  if (
    err !== null &&
    typeof err === "object" &&
    "errors" in err &&
    Array.isArray((err as { errors: unknown[] }).errors)
  ) {
    const firstError = (err as { errors: Array<{ longMessage?: string; message?: string }> }).errors[0];
    return firstError?.longMessage || firstError?.message || fallback;
  }
  return fallback;
}

export default function SignInScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { resetSuccess } = useLocalSearchParams<{ resetSuccess?: string }>();
  const { isLoaded, signIn, setActive } = useSignIn();
  const { signUp } = useSignUp();
  const { startOAuthFlow: startGoogleOAuth } = useOAuth({ strategy: "oauth_google" });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [oauthLoading, setOAuthLoading] = useState<"google" | "apple" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsMfa, setNeedsMfa] = useState(false);
  // Initialize to the iOS heuristic so the button doesn't pop in after first
  // render. The async check below confirms / disables it on simulators where
  // Apple auth isn't actually available.
  const [appleAvailable, setAppleAvailable] = useState(Platform.OS === "ios");

  useEffect(() => {
    let cancelled = false;
    isAppleAuthAvailable().then((available) => {
      if (!cancelled) setAppleAvailable(available);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGoogleSignIn = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOAuthLoading("google");
    setError(null);
    try {
      const { createdSessionId, setActive: oauthSetActive } = await startGoogleOAuth();
      if (createdSessionId && oauthSetActive) {
        await oauthSetActive({ session: createdSessionId });
        router.replace("/(tabs)");
      }
    } catch (err: unknown) {
      setError(getClerkErrorMessage(err, "Google sign-in failed. Please try again."));
    } finally {
      setOAuthLoading(null);
    }
  };

  const handleAppleSignIn = async () => {
    if (!signIn || !signUp) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOAuthLoading("apple");
    setError(null);
    try {
      const credential = await requestAppleCredential();

      // Try to sign in. If the user doesn't exist yet, Clerk returns a
      // transferable signal that we hand off to signUp so first-time Apple
      // users land in (tabs) without bouncing back to the sign-up screen.
      const signInAttempt = await signIn.create({
        strategy: "oauth_token_apple",
        token: credential.identityToken,
      });

      if (signInAttempt.status === "complete" && signInAttempt.createdSessionId) {
        await setActive({ session: signInAttempt.createdSessionId });
        router.replace("/(tabs)");
        return;
      }

      // Existing Apple users with MFA — kick into the same MFA flow as password sign-in.
      if (signInAttempt.status === "needs_second_factor") {
        await signIn.prepareSecondFactor({ strategy: "email_code" });
        setNeedsMfa(true);
        return;
      }

      // First-time Apple users: transfer to sign-up. Apple only returns
      // fullName on the very first authorization, so forward it now or the
      // user's profile will be empty forever.
      const signUpAttempt = await signUp.create({
        transfer: true,
        firstName: credential.fullName?.givenName ?? undefined,
        lastName: credential.fullName?.familyName ?? undefined,
      });
      if (signUpAttempt.status === "complete" && signUpAttempt.createdSessionId) {
        await setActive({ session: signUpAttempt.createdSessionId });
        router.replace("/(tabs)");
        return;
      }

      setError("Apple sign-in could not be completed. Please try again.");
    } catch (err: unknown) {
      if (isUserCanceledAppleError(err)) return; // silent on user cancel
      setError(getClerkErrorMessage(err, "Apple sign-in failed. Please try again."));
    } finally {
      setOAuthLoading(null);
    }
  };

  const handleSignIn = async () => {
    if (!isLoaded || !signIn) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsLoading(true);
    setError(null);
    try {
      const result = await signIn.create({
        strategy: "password",
        identifier: email,
        password,
      });

      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        router.replace("/(tabs)");
      } else if (result.status === "needs_second_factor") {
        await signIn.prepareSecondFactor({ strategy: "email_code" });
        setNeedsMfa(true);
      } else {
        setError("Sign-in could not be completed. Please try again.");
      }
    } catch (err: unknown) {
      setError(getClerkErrorMessage(err, "An error occurred. Please check your credentials and try again."));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!isLoaded || !signIn) return;
    setError(null);
    try {
      await signIn.prepareSecondFactor({ strategy: "email_code" });
    } catch (err: unknown) {
      setError(getClerkErrorMessage(err, "Failed to resend code. Please try again."));
    }
  };

  const handleVerify = async () => {
    if (!isLoaded || !signIn) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await signIn.attemptSecondFactor({
        strategy: "email_code",
        code: verificationCode,
      });
      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        router.replace("/(tabs)");
      } else {
        setError("Verification failed. Please try again.");
      }
    } catch (err: unknown) {
      setError(getClerkErrorMessage(err, "Verification failed. Please check the code and try again."));
    } finally {
      setIsLoading(false);
    }
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (needsMfa) {
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
          {error && (
            <Text style={[styles.errorText, { color: colors.negative }]}>{error}</Text>
          )}
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: isLoading ? 0.6 : 1 }]}
            onPress={handleVerify}
            disabled={isLoading}
          >
            {isLoading ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Verify</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={handleResendCode}>
            <Text style={[styles.linkText, { color: colors.primary, textAlign: "center", marginTop: 8 }]}>Resend code</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setNeedsMfa(false); setError(null); setVerificationCode(""); }}>
            <Text style={[styles.linkText, { color: colors.mutedForeground, textAlign: "center", marginTop: 8 }]}>Back to sign in</Text>
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
        <Text style={[styles.title, { color: colors.foreground }]}>Markets, simplified</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Real-time insights and AI-powered clarity for every stock you follow.
        </Text>

        {resetSuccess === "true" && (
          <View style={[styles.successBanner, { backgroundColor: "#22c55e18", borderColor: "#22c55e44" }]}>
            <Feather name="check-circle" size={16} color="#22c55e" />
            <Text style={[styles.successText, { color: "#22c55e" }]}>Password reset successfully. Sign in with your new password.</Text>
          </View>
        )}

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

          <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 14 }]}>Password</Text>
          <View style={styles.passwordWrapper}>
            <TextInput
              style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, paddingRight: 48 }]}
              value={password}
              placeholder="••••••••"
              placeholderTextColor={colors.mutedForeground}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity
              style={styles.eyeToggle}
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <Link href="/(auth)/forgot-password" asChild>
            <TouchableOpacity style={styles.forgotRow}>
              <Text style={[styles.linkText, { color: colors.primary }]}>Forgot password?</Text>
            </TouchableOpacity>
          </Link>
        </View>

        {error && (
          <Text style={[styles.errorText, { color: colors.negative, marginTop: 8 }]}>{error}</Text>
        )}

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

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>or</Text>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        {/* Social sign-in buttons */}
        <View style={styles.socialSection}>
          <TouchableOpacity
            style={[styles.socialButton, { backgroundColor: colors.card, borderColor: colors.border, opacity: oauthLoading === "apple" ? 0.5 : 1 }]}
            onPress={handleGoogleSignIn}
            disabled={!!oauthLoading}
          >
            {oauthLoading === "google" ? (
              <ActivityIndicator color={colors.foreground} size="small" />
            ) : (
              <Text style={{ fontSize: 16, lineHeight: 18 }}>G</Text>
            )}
            <Text style={[styles.socialButtonText, { color: colors.foreground }]}>Continue with Google</Text>
          </TouchableOpacity>
          {appleAvailable && (
            oauthLoading === "apple" ? (
              <View style={[styles.socialButton, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <ActivityIndicator color={colors.foreground} size="small" />
                <Text style={[styles.socialButtonText, { color: colors.foreground }]}>Signing in with Apple…</Text>
              </View>
            ) : (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={14}
                style={styles.appleButton}
                onPress={handleAppleSignIn}
              />
            )
          )}
        </View>

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
  passwordWrapper: { position: "relative" as const, justifyContent: "center" as const },
  eyeToggle: {
    position: "absolute" as const,
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  forgotRow: { alignSelf: "flex-end" as const, marginTop: 10 },
  successBanner: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  successText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 18,
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
  socialSection: { gap: 10, marginBottom: 16 },
  socialButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
  },
  appleButton: {
    width: "100%",
    height: 48,
  },
  socialButtonText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 13, fontFamily: "Inter_400Regular" },
});
