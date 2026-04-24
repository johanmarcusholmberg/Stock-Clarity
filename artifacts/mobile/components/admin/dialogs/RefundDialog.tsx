import React, { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { useColors } from "@/hooks/useColors";
import {
  DialogShell,
  DialogButton,
  ErrorBanner,
  InfoBanner,
  LabeledField,
  useDialogInputStyle,
} from "./shared";
import { ConfirmTypeEmail, confirmTypeEmailMatched } from "./ConfirmTypeEmail";
import {
  isIapStubResponse,
  refundIap,
  refundStripe,
  SubscriptionSource,
} from "@/lib/adminApi";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userId: string;
  userEmail: string;
  requesterEmail: string;
  source: SubscriptionSource;
}

type RefundMode = "full" | "partial";

export function RefundDialog({
  visible,
  onClose,
  onSuccess,
  userId,
  userEmail,
  requesterEmail,
  source,
}: Props) {
  const colors = useColors();
  const inputStyle = useDialogInputStyle();

  const [mode, setMode] = useState<RefundMode>("full");
  const [amount, setAmount] = useState(""); // dollars/euros — converted to cents on submit
  const [reason, setReason] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stubInfo, setStubInfo] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setMode("full");
      setAmount("");
      setReason("");
      setConfirmEmail("");
      setError(null);
      setStubInfo(null);
      setSubmitting(false);
    }
  }, [visible]);

  const reasonValid = reason.trim().length > 0;
  const amountNum = mode === "partial" ? Number(amount) : NaN;
  // Accepts decimal strings like "12.50" — converts to cents. Must be > 0.
  const partialValid =
    mode === "full" || (Number.isFinite(amountNum) && amountNum > 0 && Math.round(amountNum * 100) > 0);
  const confirmed = confirmTypeEmailMatched(confirmEmail, userEmail, undefined, "");
  const canSubmit = reasonValid && partialValid && confirmed && !submitting;

  const isApple = source === "apple_iap";
  const isGoogle = source === "google_play";
  const isStripe = source === "stripe";

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setStubInfo(null);

    const amountCents = mode === "partial" ? Math.round(Number(amount) * 100) : undefined;

    if (isStripe) {
      const result = await refundStripe({ requesterEmail }, userId, {
        amountCents,
        reason: reason.trim(),
      });
      setSubmitting(false);
      if (result.ok) {
        onSuccess();
        onClose();
      } else {
        setError(result.error);
      }
      return;
    }

    if (isApple || isGoogle) {
      const platform = isApple ? "apple" : "google";
      const result = await refundIap({ requesterEmail }, userId, platform, {
        amountCents,
        reason: reason.trim(),
      });
      setSubmitting(false);
      if (result.ok) {
        onSuccess();
        onClose();
        return;
      }
      if (isIapStubResponse(result)) {
        setStubInfo(
          isApple
            ? "Intent recorded. Apple's refund-request API integration is pending — issue the refund through App Store Connect until it ships."
            : "Intent recorded. Google Play refund integration is pending — issue through the Play Console until it ships.",
        );
        onSuccess();
      } else {
        setError(result.error);
      }
      return;
    }

    setSubmitting(false);
    setError(`Nothing to refund for source: ${source}`);
  }

  const title =
    isApple ? "Record Apple refund request" :
    isGoogle ? "Record Google Play refund" :
    "Refund Stripe charge";

  return (
    <DialogShell
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle={`${userEmail} · ${source}`}
      icon="refresh-ccw"
      iconTint={colors.warning}
      dismissable={!submitting && !stubInfo}
      footer={
        <>
          <DialogButton
            label={stubInfo ? "Close" : "Dismiss"}
            onPress={onClose}
            variant="secondary"
            flex
            disabled={submitting}
          />
          {!stubInfo && (
            <DialogButton
              label={isApple || isGoogle ? "Record intent" : mode === "full" ? "Refund in full" : "Refund partial"}
              onPress={handleSubmit}
              disabled={!canSubmit}
              loading={submitting}
              variant="destructive"
              flex
            />
          )}
        </>
      }
    >
      {isApple ? (
        <InfoBanner
          tone="warning"
          message="Apple's refund-request API isn't integrated yet. Submitting records the intent; issue the refund through App Store Connect until it ships."
        />
      ) : isGoogle ? (
        <InfoBanner
          tone="warning"
          message="Google Play refund integration isn't wired up yet. Submitting records the intent; issue through the Play Console manually."
        />
      ) : null}

      <LabeledField label="Amount">
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["full", "partial"] as RefundMode[]).map((m) => {
            const active = mode === m;
            return (
              <TouchableOpacity
                key={m}
                onPress={() => setMode(m)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 10,
                  borderWidth: 1.5,
                  borderColor: active ? colors.warning : colors.border,
                  backgroundColor: active ? colors.warning + "18" : "transparent",
                  alignItems: "center",
                }}
                disabled={submitting || !!stubInfo}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: "Inter_700Bold",
                    color: active ? colors.warning : colors.mutedForeground,
                  }}
                >
                  {m === "full" ? "Full" : "Partial"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </LabeledField>

      {mode === "partial" && (
        <LabeledField label="Amount (major units)" hint="Enter in dollars/euros — converted to cents on submit. Must not exceed refundable balance.">
          <TextInput
            style={inputStyle}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="12.50"
            placeholderTextColor={colors.mutedForeground}
            editable={!submitting && !stubInfo}
          />
        </LabeledField>
      )}

      <LabeledField label="Reason" hint="Required — shows in the audit log and on Stripe metadata">
        <TextInput
          style={[inputStyle, { minHeight: 64, textAlignVertical: "top" }]}
          value={reason}
          onChangeText={setReason}
          placeholder="e.g. double-charge on 2026-04-12"
          placeholderTextColor={colors.mutedForeground}
          multiline
          editable={!submitting && !stubInfo}
        />
      </LabeledField>

      {!stubInfo && (
        <ConfirmTypeEmail
          targetEmail={userEmail}
          emailInput={confirmEmail}
          onEmailInputChange={setConfirmEmail}
          phraseInput=""
          onPhraseInputChange={() => {}}
          disabled={submitting}
        />
      )}

      {stubInfo ? <InfoBanner tone="success" message={stubInfo} /> : <ErrorBanner message={error} />}
    </DialogShell>
  );
}
