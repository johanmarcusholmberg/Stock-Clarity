import { Feather } from "@expo/vector-icons";
import { useSignIn, useSignUp } from "@clerk/expo/legacy";
import { useOAuth } from "@clerk/expo";
import { Link, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState, useMemo } from "react";
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

interface PasswordRule {
  key: string;
  label: string;
  test: (pw: string) => boolean;
}

const PASSWORD_RULES: PasswordRule[] = [
  { key: "length", label: "8+ characters", test: (pw) => pw.length >= 8 },
  { key: "upper", label: "Uppercase letter", test: (pw) => /[A-Z]/.test(pw) },
  { key: "lower", label: "Lowercase letter", test: (pw) => /[a-z]/.test(pw) },
  { key: "number", label: "Number", test: (pw) => /[0-9]/.test(pw) },
  { key: "special", label: "Special character", test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

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

function getTimezoneLabel(tz: string): string {
  try {
    const now = new Date();
    const offset = new Intl.DateTimeFormat("en", {
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(now).find((p) => p.type === "timeZoneName")?.value ?? "";
    const city = tz.split("/").pop()?.replace(/_/g, " ") ?? tz;
    return offset ? `${city} (${offset})` : city;
  } catch {
    return tz;
  }
}

export default function SignUpScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isLoaded, signUp, setActive } = useSignUp();
  const { signIn } = useSignIn();
  const { startOAuthFlow: startGoogleOAuth } = useOAuth({ strategy: "oauth_google" });
  // Initialize to the iOS heuristic so the button doesn't pop in after first
  // render. The async check below confirms / disables it on simulators.
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

  const [email, setEmail] = useState("");
  const [oauthLoading, setOAuthLoading] = useState<"google" | "apple" | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);

  const passwordRuleResults = useMemo(
    () => PASSWORD_RULES.map((r) => ({ ...r, met: r.test(password) })),
    [password]
  );
  const allPasswordRulesMet = passwordRuleResults.every((r) => r.met);
  const passwordStrength = passwordRuleResults.filter((r) => r.met).length;
  const [verificationCode, setVerificationCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [pendingTimezone, setPendingTimezone] = useState(false);
  const [detectedTimezone] = useState<string>(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "UTC";
    }
  });
  const [sessionId, setSessionId] = useState<string | null>(null);

  const handleGoogleSignUp = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOAuthLoading("google");
    try {
      const { createdSessionId, setActive: oauthSetActive } = await startGoogleOAuth();
      if (createdSessionId && oauthSetActive) {
        await oauthSetActive({ session: createdSessionId });
        router.replace("/(tabs)");
      }
    } catch {
    } finally {
      setOAuthLoading(null);
    }
  };

  const handleAppleSignUp = async () => {
    if (!signUp || !signIn) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOAuthLoading("apple");
    setError(null);
    try {
      const credential = await requestAppleCredential();

      // Sign in first — Apple's identity token works for both new & returning
      // users. If the account doesn't exist yet, Clerk hands us a transferable
      // signal that we forward to signUp.create to mint the new account.
      const signInAttempt = await signIn.create({
        strategy: "oauth_token_apple",
        token: credential.identityToken,
      });

      if (signInAttempt.status === "complete" && signInAttempt.createdSessionId) {
        await setActive({ session: signInAttempt.createdSessionId });
        router.replace("/(tabs)");
        return;
      }

      // Existing Apple user with MFA — punt them to the sign-in screen, where
      // the full MFA flow lives, instead of duplicating it here.
      if (signInAttempt.status === "needs_second_factor") {
        setError("This Apple ID is already linked to an account. Please sign in instead.");
        router.replace("/(auth)/sign-in");
        return;
      }

      // First-time Apple users: forward fullName so the profile isn't empty.
      // Apple only returns this on the very first authorization.
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

      setError("Apple sign-up could not be completed. Please try again.");
    } catch (err: unknown) {
      if (isUserCanceledAppleError(err)) return;
      setError(getClerkErrorMessage(err, "Apple sign-up failed. Please try again."));
    } finally {
      setOAuthLoading(null);
    }
  };

  const handleSignUp = async () => {
    if (!isLoaded || !signUp) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPasswordTouched(true);
    if (!allPasswordRulesMet) {
      const missing = passwordRuleResults.filter((r) => !r.met).map((r) => r.label);
      setError(`Password must include: ${missing.join(", ")}.`);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await signUp.create({ emailAddress: email, password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingVerification(true);
    } catch (err: unknown) {
      setError(getClerkErrorMessage(err, "Sign-up failed. Please check your details and try again."));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!isLoaded || !signUp) return;
    setError(null);
    try {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
    } catch (err: unknown) {
      setError(getClerkErrorMessage(err, "Failed to resend code. Please try again."));
    }
  };

  const handleVerify = async () => {
    if (!isLoaded || !signUp) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await signUp.attemptEmailAddressVerification({
        code: verificationCode,
      });
      if (result.status === "complete" && result.createdSessionId) {
        // Record initial password in history (non-blocking)
        try {
          const apiBase = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
          if (apiBase) {
            await fetch(`${apiBase}/auth/record-password`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email, password }),
            });
          }
        } catch {
          // Non-blocking — history storage failure shouldn't block signup
        }
        setSessionId(result.createdSessionId);
        setPendingVerification(false);
        setPendingTimezone(true);
      } else {
        setError("Email verification failed. Please try again.");
      }
    } catch (err: unknown) {
      setError(getClerkErrorMessage(err, "Verification failed. Please check the code and try again."));
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmTimezone = async () => {
    if (!isLoaded || !setActive || !sessionId) return;
    setIsLoading(true);
    try {
      await setActive({ session: sessionId });
      router.replace({ pathname: "/(tabs)", params: { pendingTimezone: detectedTimezone } });
    } catch {
      router.replace("/(tabs)");
    } finally {
      setIsLoading(false);
    }
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (pendingVerification) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.inner, { paddingTop: topPad + 24 }]}>
          <View style={styles.logoRow}>
            <View style={[styles.logoIcon, { backgroundColor: `${colors.primary}22`, borderColor: `${colors.primary}44` }]}>
              <Feather name="mail" size={28} color={colors.primary} />
            </View>
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>Check your email</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            We sent a verification code to {email}. Enter it below to activate your account.
          </Text>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>Verification code</Text>
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
            disabled={isLoading || !verificationCode}
          >
            {isLoading ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Verify email</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={handleResendCode}>
            <Text style={[styles.linkText, { color: colors.primary, textAlign: "center", marginTop: 8 }]}>Resend code</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (pendingTimezone) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.inner, { paddingTop: topPad + 24 }]}>
          <View style={styles.logoRow}>
            <View style={[styles.logoIcon, { backgroundColor: `${colors.primary}22`, borderColor: `${colors.primary}44` }]}>
              <Feather name="globe" size={28} color={colors.primary} />
            </View>
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>Your timezone</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            We detected your timezone so we can show you a personalised greeting. You can change this in your account settings.
          </Text>
          <View style={{
            backgroundColor: colors.secondary,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 16,
            marginBottom: 24,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${colors.primary}22`, alignItems: "center", justifyContent: "center" }}>
              <Feather name="clock" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>
                Detected timezone
              </Text>
              <Text style={{ color: colors.foreground, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>
                {getTimezoneLabel(detectedTimezone)}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: isLoading ? 0.6 : 1 }]}
            onPress={handleConfirmTimezone}
            disabled={isLoading}
          >
            {isLoading ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Confirm & continue</Text>}
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
          Track the stocks you care about with real-time data and AI-powered insights.
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

          <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 14 }]}>Password</Text>
          <View style={styles.passwordWrapper}>
            <TextInput
              style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, paddingRight: 48 }]}
              value={password}
              placeholder="••••••••"
              placeholderTextColor={colors.mutedForeground}
              onChangeText={(v) => { setPassword(v); setPasswordTouched(true); }}
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

          {/* Password strength indicator — shown after user starts typing */}
          {passwordTouched && password.length > 0 && (
            <View style={{ marginTop: 10, gap: 0 }}>
              {/* Strength bar */}
              <View style={{ flexDirection: "row", gap: 4, marginBottom: 10 }}>
                {Array.from({ length: 5 }).map((_, i) => {
                  const filled = i < passwordStrength;
                  const barColor =
                    passwordStrength <= 1 ? "#ef4444"
                    : passwordStrength <= 2 ? "#f97316"
                    : passwordStrength <= 3 ? "#eab308"
                    : passwordStrength <= 4 ? "#84cc16"
                    : "#22c55e";
                  return (
                    <View
                      key={i}
                      style={{
                        flex: 1,
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: filled ? barColor : colors.border,
                      }}
                    />
                  );
                })}
              </View>
              {/* Checklist */}
              <View style={{ gap: 4 }}>
                {passwordRuleResults.map((rule) => (
                  <View key={rule.key} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Feather
                      name={rule.met ? "check-circle" : "circle"}
                      size={13}
                      color={rule.met ? "#22c55e" : colors.mutedForeground}
                    />
                    <Text
                      style={{
                        fontSize: 12,
                        fontFamily: "Inter_400Regular",
                        color: rule.met ? "#22c55e" : colors.mutedForeground,
                      }}
                    >
                      {rule.label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        {error && (
          <Text style={[styles.errorText, { color: colors.negative, marginTop: 8 }]}>{error}</Text>
        )}

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: (!email || !password || isLoading) ? 0.5 : 1 }]}
          onPress={handleSignUp}
          disabled={!email || !password || isLoading}
          accessibilityLabel="Create account"
        >
          {isLoading
            ? <ActivityIndicator color={colors.primaryForeground} />
            : <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Create account</Text>
          }
        </TouchableOpacity>

        <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>
          By creating an account, you agree to our Terms of Service and Privacy Policy.
        </Text>

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>or</Text>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        {/* Social sign-up buttons */}
        <View style={styles.socialSection}>
          <TouchableOpacity
            style={[styles.socialButton, { backgroundColor: colors.card, borderColor: colors.border, opacity: oauthLoading === "apple" ? 0.5 : 1 }]}
            onPress={handleGoogleSignUp}
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
                <Text style={[styles.socialButtonText, { color: colors.foreground }]}>Signing up with Apple…</Text>
              </View>
            ) : (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={14}
                style={styles.appleButton}
                onPress={handleAppleSignUp}
              />
            )
          )}
        </View>

        <View style={styles.switchRow}>
          <Text style={[styles.switchText, { color: colors.mutedForeground }]}>Already have an account? </Text>
          <Link href="/(auth)/sign-in" asChild>
            <TouchableOpacity>
              <Text style={[styles.linkText, { color: colors.primary }]}>Sign in</Text>
            </TouchableOpacity>
          </Link>
        </View>

        <View nativeID="clerk-captcha" />
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
  primaryButton: {
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 24,
    marginBottom: 12,
  },
  primaryButtonText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  disclaimer: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 16,
    marginBottom: 16,
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
