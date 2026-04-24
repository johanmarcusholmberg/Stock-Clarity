import { Feather } from "@expo/vector-icons";
import { useSignIn } from "@clerk/expo/legacy";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useState, useMemo } from "react";
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

type Step = "email" | "code" | "newPassword";

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isLoaded, signIn, setActive } = useSignIn();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordTouched, setPasswordTouched] = useState(false);

  const passwordRuleResults = useMemo(
    () => PASSWORD_RULES.map((r) => ({ ...r, met: r.test(password) })),
    [password]
  );
  const allPasswordRulesMet = passwordRuleResults.every((r) => r.met);
  const passwordStrength = passwordRuleResults.filter((r) => r.met).length;

  const handleSendCode = async () => {
    if (!isLoaded || !signIn) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsLoading(true);
    setError(null);
    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email,
      });
      setStep("code");
    } catch (err: unknown) {
      setError(getClerkErrorMessage(err, "Could not send reset code. Please check your email and try again."));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!isLoaded || !signIn) return;
    setError(null);
    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email,
      });
    } catch (err: unknown) {
      setError(getClerkErrorMessage(err, "Failed to resend code. Please try again."));
    }
  };

  const handleVerifyCode = async () => {
    if (!isLoaded || !signIn) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsLoading(true);
    setError(null);
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code,
      });
      if (result.status === "needs_new_password") {
        setStep("newPassword");
      } else {
        setError("Verification failed. Please try again.");
      }
    } catch (err: unknown) {
      setError(getClerkErrorMessage(err, "Invalid code. Please check and try again."));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!isLoaded || !signIn) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPasswordTouched(true);

    if (!allPasswordRulesMet) {
      const missing = passwordRuleResults.filter((r) => !r.met).map((r) => r.label);
      setError(`Password must include: ${missing.join(", ")}.`);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    setError(null);

    // Check password history against backend
    try {
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      if (domain) {
        const historyRes = await fetch(`https://${domain}/api/auth/check-password-history`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (!historyRes.ok) {
          const data = await historyRes.json().catch(() => ({}));
          if (data.error) {
            setError(data.error);
            setIsLoading(false);
            return;
          }
        }
      }
    } catch {
      // If backend is unreachable, allow password reset to proceed
    }

    try {
      const result = await signIn.resetPassword({
        password,
        signOutOfOtherSessions: true,
      });

      // Record the new password hash in backend history
      try {
        const domain = process.env.EXPO_PUBLIC_DOMAIN;
        if (domain) {
          await fetch(`https://${domain}/api/auth/record-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          });
        }
      } catch {
        // Non-blocking — history storage failure shouldn't block the user
      }

      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        router.replace("/(tabs)");
      } else {
        // Redirect to sign-in with success message
        router.replace({
          pathname: "/(auth)/sign-in",
          params: { resetSuccess: "true" },
        });
      }
    } catch (err: unknown) {
      setError(getClerkErrorMessage(err, "Failed to reset password. Please try again."));
    } finally {
      setIsLoading(false);
    }
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const renderHeader = (icon: string, title: string, subtitle: string) => (
    <>
      <View style={styles.logoRow}>
        <View style={[styles.logoIcon, { backgroundColor: `${colors.primary}22`, borderColor: `${colors.primary}44` }]}>
          <Feather name={icon as any} size={28} color={colors.primary} />
        </View>
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
    </>
  );

  if (step === "code") {
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
          {renderHeader("mail", "Check your email", `We sent a reset code to ${email}. Enter it below.`)}

          <Text style={[styles.label, { color: colors.mutedForeground }]}>Verification code</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground }]}
            value={code}
            placeholder="6-digit code"
            placeholderTextColor={colors.mutedForeground}
            onChangeText={setCode}
            keyboardType="numeric"
            autoFocus
          />

          {error && (
            <Text style={[styles.errorText, { color: colors.negative, marginTop: 8 }]}>{error}</Text>
          )}

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: (!code || isLoading) ? 0.5 : 1 }]}
            onPress={handleVerifyCode}
            disabled={!code || isLoading}
          >
            {isLoading ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Verify code</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={handleResendCode}>
            <Text style={[styles.linkText, { color: colors.primary, textAlign: "center", marginTop: 8 }]}>Resend code</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => { setStep("email"); setError(null); setCode(""); }}>
            <Text style={[styles.linkText, { color: colors.mutedForeground, textAlign: "center", marginTop: 8 }]}>Back</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (step === "newPassword") {
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
          {renderHeader("lock", "Set new password", "Choose a strong password for your account.")}

          <View style={styles.formSection}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>New password</Text>
            <View style={styles.passwordWrapper}>
              <TextInput
                style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, paddingRight: 48 }]}
                value={password}
                placeholder="••••••••"
                placeholderTextColor={colors.mutedForeground}
                onChangeText={(v) => { setPassword(v); setPasswordTouched(true); }}
                secureTextEntry={!showPassword}
                autoFocus
              />
              <TouchableOpacity
                style={styles.eyeToggle}
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* Password strength indicator */}
            {passwordTouched && password.length > 0 && (
              <View style={{ marginTop: 10, gap: 0 }}>
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

            <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 14 }]}>Confirm password</Text>
            <View style={styles.passwordWrapper}>
              <TextInput
                style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground, paddingRight: 48 }]}
                value={confirmPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.mutedForeground}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirm}
              />
              <TouchableOpacity
                style={styles.eyeToggle}
                onPress={() => setShowConfirm((v) => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name={showConfirm ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          </View>

          {error && (
            <Text style={[styles.errorText, { color: colors.negative, marginTop: 8 }]}>{error}</Text>
          )}

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: (!password || !confirmPassword || isLoading) ? 0.5 : 1 }]}
            onPress={handleResetPassword}
            disabled={!password || !confirmPassword || isLoading}
          >
            {isLoading ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Reset password</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // Step: email
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
        {renderHeader("key", "Reset password", "Enter the email address associated with your account and we\u2019ll send you a code to reset your password.")}

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
          autoFocus
        />

        {error && (
          <Text style={[styles.errorText, { color: colors.negative, marginTop: 8 }]}>{error}</Text>
        )}

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: (!email || isLoading) ? 0.5 : 1 }]}
          onPress={handleSendCode}
          disabled={!email || isLoading}
        >
          {isLoading ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Send reset code</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.linkText, { color: colors.mutedForeground, textAlign: "center", marginTop: 8 }]}>Back to sign in</Text>
        </TouchableOpacity>
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
    marginBottom: 16,
  },
  primaryButtonText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
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
