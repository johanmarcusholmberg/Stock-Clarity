import React, { useEffect, useState } from "react";
import { TextInput } from "react-native";
import { useColors } from "@/hooks/useColors";
import {
  DialogShell,
  DialogButton,
  ErrorBanner,
  LabeledField,
  useDialogInputStyle,
} from "./shared";
import { ConfirmTypeEmail, confirmTypeEmailMatched } from "./ConfirmTypeEmail";
import { revokeGrant, GrantRow } from "@/lib/adminApi";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  grant: GrantRow | null;
  userEmail: string;
  requesterEmail: string;
}

export function RevokeDialog({ visible, onClose, onSuccess, grant, userEmail, requesterEmail }: Props) {
  const colors = useColors();
  const inputStyle = useDialogInputStyle();
  const [reason, setReason] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setReason("");
      setConfirmEmail("");
      setError(null);
      setSubmitting(false);
    }
  }, [visible]);

  const reasonValid = reason.trim().length > 0;
  const confirmed = confirmTypeEmailMatched(confirmEmail, userEmail, undefined, "");
  const canSubmit = reasonValid && confirmed && !submitting && !!grant;

  async function handleSubmit() {
    if (!grant || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    const result = await revokeGrant({ requesterEmail }, grant.id, { reason: reason.trim() });
    setSubmitting(false);
    if (result.ok) {
      onSuccess();
      onClose();
    } else {
      setError(result.error);
    }
  }

  return (
    <DialogShell
      visible={visible}
      onClose={onClose}
      title="Revoke grant"
      subtitle={grant ? `${grant.tier.toUpperCase()} · ${userEmail}` : userEmail}
      icon="x-octagon"
      iconTint={colors.destructive}
      dismissable={!submitting}
      footer={
        <>
          <DialogButton label="Cancel" onPress={onClose} variant="secondary" flex disabled={submitting} />
          <DialogButton
            label="Revoke"
            onPress={handleSubmit}
            disabled={!canSubmit}
            loading={submitting}
            variant="destructive"
            flex
          />
        </>
      }
    >
      <LabeledField label="Reason" hint="Required — shows in the audit log">
        <TextInput
          style={[inputStyle, { minHeight: 64, textAlignVertical: "top" }]}
          value={reason}
          onChangeText={setReason}
          placeholder="e.g. granted in error"
          placeholderTextColor={colors.mutedForeground}
          multiline
          editable={!submitting}
        />
      </LabeledField>

      <ConfirmTypeEmail
        targetEmail={userEmail}
        emailInput={confirmEmail}
        onEmailInputChange={setConfirmEmail}
        phraseInput=""
        onPhraseInputChange={() => {}}
        disabled={submitting}
      />

      <ErrorBanner message={error} />
    </DialogShell>
  );
}
