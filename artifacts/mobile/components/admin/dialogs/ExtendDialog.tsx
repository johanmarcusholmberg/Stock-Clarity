import React, { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { useColors } from "@/hooks/useColors";
import {
  DialogShell,
  DialogButton,
  ErrorBanner,
  LabeledField,
  useDialogInputStyle,
} from "./shared";
import { extendGrant, GrantRow } from "@/lib/adminApi";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  grant: GrantRow | null;
  requesterEmail: string;
}

const PRESETS = [7, 30, 90];

export function ExtendDialog({ visible, onClose, onSuccess, grant, requesterEmail }: Props) {
  const colors = useColors();
  const inputStyle = useDialogInputStyle();
  const [days, setDays] = useState("30");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setDays("30");
      setReason("");
      setError(null);
      setSubmitting(false);
    }
  }, [visible]);

  const daysNum = parseInt(days, 10);
  const daysValid = Number.isFinite(daysNum) && daysNum > 0 && daysNum <= 3650;
  const canSubmit = daysValid && !submitting && !!grant;

  async function handleSubmit() {
    if (!grant || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    const result = await extendGrant({ requesterEmail }, grant.id, {
      extendDays: daysNum,
      reason: reason.trim() || undefined,
    });
    setSubmitting(false);
    if (result.ok) {
      onSuccess();
      onClose();
    } else {
      setError(result.error);
    }
  }

  const currentExpiry = grant ? new Date(grant.expires_at) : null;
  const newExpiry =
    currentExpiry && daysValid ? new Date(currentExpiry.getTime() + daysNum * 24 * 60 * 60 * 1000) : null;

  return (
    <DialogShell
      visible={visible}
      onClose={onClose}
      title="Extend grant"
      subtitle={grant ? `${grant.tier.toUpperCase()} · expires ${currentExpiry?.toLocaleDateString() ?? ""}` : undefined}
      icon="clock"
      iconTint={colors.primary}
      dismissable={!submitting}
      footer={
        <>
          <DialogButton label="Cancel" onPress={onClose} variant="secondary" flex disabled={submitting} />
          <DialogButton label="Extend" onPress={handleSubmit} disabled={!canSubmit} loading={submitting} flex />
        </>
      }
    >
      <LabeledField label="Extend by (days)" hint={newExpiry ? `New expiry: ${newExpiry.toLocaleDateString()}` : undefined}>
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 6 }}>
          {PRESETS.map((n) => (
            <TouchableOpacity
              key={n}
              onPress={() => setDays(String(n))}
              style={{
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: days === String(n) ? colors.primary + "18" : "transparent",
              }}
              disabled={submitting}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: "Inter_600SemiBold",
                  color: days === String(n) ? colors.primary : colors.mutedForeground,
                }}
              >
                +{n}d
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={inputStyle}
          value={days}
          onChangeText={setDays}
          keyboardType="number-pad"
          editable={!submitting}
        />
      </LabeledField>

      <LabeledField label="Reason (optional)">
        <TextInput
          style={[inputStyle, { minHeight: 56, textAlignVertical: "top" }]}
          value={reason}
          onChangeText={setReason}
          placeholder="Why extend?"
          placeholderTextColor={colors.mutedForeground}
          multiline
          editable={!submitting}
        />
      </LabeledField>

      <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 }}>
        Extending resets the 3-day expiry warning so the user re-enters the warning pool when they approach the new date.
      </Text>

      <ErrorBanner message={error} />
    </DialogShell>
  );
}
