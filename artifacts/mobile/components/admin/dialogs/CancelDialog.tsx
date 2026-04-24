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
  cancelIap,
  cancelStripe,
  isIapStubResponse,
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

type CancelMode = "immediate" | "period_end";

export function CancelDialog({
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

  const [mode, setMode] = useState<CancelMode>("immediate");
  const [reason, setReason] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stubInfo, setStubInfo] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setMode("immediate");
      setReason("");
      setConfirmEmail("");
      setConfirmPhrase("");
      setError(null);
      setStubInfo(null);
      setSubmitting(false);
    }
  }, [visible]);

  const reasonValid = reason.trim().length > 0;
  const confirmed = confirmTypeEmailMatched(confirmEmail, userEmail, "CANCEL", confirmPhrase);
  const canSubmit = reasonValid && confirmed && !submitting;

  const isApple = source === "apple_iap";
  const isGoogle = source === "google_play";
  const isStripe = source === "stripe";

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setStubInfo(null);

    if (isStripe) {
      const result = await cancelStripe({ requesterEmail }, userId, { mode, reason: reason.trim() });
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
      const result = await cancelIap({ requesterEmail }, userId, platform, { reason: reason.trim() });
      setSubmitting(false);
      if (result.ok) {
        // Shouldn't happen until IAP ships, but handle it.
        onSuccess();
        onClose();
        return;
      }
      if (isIapStubResponse(result)) {
        setStubInfo(
          isApple
            ? "Intent recorded. Apple does not support server-side cancellation — the user must cancel in App Store settings. Follow up with them directly."
            : "Intent recorded. Google Play cancel integration is pending — follow up manually until it ships.",
        );
        // Fire onSuccess so the audit log refreshes to show the logged intent.
        onSuccess();
      } else {
        setError(result.error);
      }
      return;
    }

    // Fallback — shouldn't hit this because the ActionsDrawer disables the
    // button for 'manual'/'none' sources.
    setSubmitting(false);
    setError(`Nothing to cancel for source: ${source}`);
  }

  const title =
    isApple ? "Record cancellation request" :
    isGoogle ? "Cancel Google Play subscription" :
    "Cancel Stripe subscription";

  const subtitle = `${userEmail} · ${source}`;

  return (
    <DialogShell
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      icon="x-circle"
      iconTint={colors.destructive}
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
              label={isApple ? "Record intent" : "Cancel subscription"}
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
          message="Apple doesn't expose a server-side cancel API. This records the intent in the audit log — you still need to instruct the user to cancel in their App Store settings."
        />
      ) : isGoogle ? (
        <InfoBanner
          tone="warning"
          message="Google Play cancel integration isn't wired up yet. Submitting records the intent in the audit log; follow up manually."
        />
      ) : null}

      {isStripe && (
        <LabeledField label="When" hint={mode === "immediate" ? "Drops access right away." : "Keeps access until period end, then stops."}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["immediate", "period_end"] as CancelMode[]).map((m) => {
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
                    borderColor: active ? colors.destructive : colors.border,
                    backgroundColor: active ? colors.destructive + "18" : "transparent",
                    alignItems: "center",
                  }}
                  disabled={submitting}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: "Inter_700Bold",
                      color: active ? colors.destructive : colors.mutedForeground,
                    }}
                  >
                    {m === "immediate" ? "Immediate" : "At period end"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </LabeledField>
      )}

      <LabeledField label="Reason" hint="Required — shows in the audit log">
        <TextInput
          style={[inputStyle, { minHeight: 64, textAlignVertical: "top" }]}
          value={reason}
          onChangeText={setReason}
          placeholder="e.g. user requested by email"
          placeholderTextColor={colors.mutedForeground}
          multiline
          editable={!submitting && !stubInfo}
        />
      </LabeledField>

      {!stubInfo && (
        <ConfirmTypeEmail
          targetEmail={userEmail}
          requirePhrase="CANCEL"
          emailInput={confirmEmail}
          onEmailInputChange={setConfirmEmail}
          phraseInput={confirmPhrase}
          onPhraseInputChange={setConfirmPhrase}
          disabled={submitting}
        />
      )}

      {stubInfo ? <InfoBanner tone="success" message={stubInfo} /> : <ErrorBanner message={error} />}
    </DialogShell>
  );
}
