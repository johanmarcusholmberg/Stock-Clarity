import React from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";
import { emailsMatch } from "@/lib/adminApi";

interface Props {
  /** Email the admin must type to confirm. Server comparison is case-insensitive. */
  targetEmail: string;
  /** Extra literal phrase required in addition to email (e.g. "CANCEL"). */
  requirePhrase?: string;
  emailInput: string;
  onEmailInputChange: (v: string) => void;
  phraseInput: string;
  onPhraseInputChange: (v: string) => void;
  disabled?: boolean;
}

/**
 * Shared confirmation gate used by every destructive admin-subscription
 * dialog (Revoke, Cancel, Refund). Renders the inputs and exposes a
 * `matched` flag via {@link confirmTypeEmailMatched} — the parent dialog
 * owns its own submit button so it can wire in loading state and its own
 * extra fields.
 *
 * The email comparison is case-insensitive and whitespace-tolerant on
 * both sides — the stored Clerk email can have surprising casing.
 */
export function ConfirmTypeEmail({
  targetEmail,
  requirePhrase,
  emailInput,
  onEmailInputChange,
  phraseInput,
  onPhraseInputChange,
  disabled,
}: Props) {
  const colors = useColors();
  const emailOk = emailsMatch(emailInput, targetEmail);
  const phraseOk = !requirePhrase || phraseInput.trim() === requirePhrase;

  const s = StyleSheet.create({
    wrap: { gap: 8, marginTop: 4 },
    label: {
      color: colors.mutedForeground,
      fontSize: 12,
      fontFamily: "Inter_500Medium",
    },
    input: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      backgroundColor: colors.secondary,
    },
    inputOk: { borderColor: colors.positive },
    inputPending: { borderColor: colors.border },
  });

  return (
    <View style={s.wrap}>
      <Text style={s.label}>
        Type <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>{targetEmail}</Text> to confirm
      </Text>
      <TextInput
        value={emailInput}
        onChangeText={onEmailInputChange}
        placeholder={targetEmail}
        placeholderTextColor={colors.mutedForeground}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        editable={!disabled}
        style={[s.input, emailOk ? s.inputOk : s.inputPending]}
      />
      {requirePhrase ? (
        <>
          <Text style={s.label}>
            Then type <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>{requirePhrase}</Text> to confirm
          </Text>
          <TextInput
            value={phraseInput}
            onChangeText={onPhraseInputChange}
            placeholder={requirePhrase}
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!disabled}
            style={[s.input, phraseOk && phraseInput.length > 0 ? s.inputOk : s.inputPending]}
          />
        </>
      ) : null}
    </View>
  );
}

/** Returns true iff the user has typed the email (and phrase, if required). */
export function confirmTypeEmailMatched(
  emailInput: string,
  targetEmail: string,
  requirePhrase: string | undefined,
  phraseInput: string,
): boolean {
  if (!emailsMatch(emailInput, targetEmail)) return false;
  if (requirePhrase && phraseInput.trim() !== requirePhrase) return false;
  return true;
}
