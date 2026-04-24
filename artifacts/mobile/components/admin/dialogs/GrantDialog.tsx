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
import {
  createGrant,
  GrantTier,
} from "@/lib/adminApi";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userId: string;
  userEmail: string;
  requesterEmail: string;
}

const PRESET_DAYS = [7, 30, 90];

export function GrantDialog({ visible, onClose, onSuccess, userId, userEmail, requesterEmail }: Props) {
  const colors = useColors();
  const inputStyle = useDialogInputStyle();
  const [tier, setTier] = useState<GrantTier>("pro");
  const [days, setDays] = useState("30");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setTier("pro");
      setDays("30");
      setReason("");
      setError(null);
      setSubmitting(false);
    }
  }, [visible]);

  const daysNum = parseInt(days, 10);
  const daysValid = Number.isFinite(daysNum) && daysNum > 0 && daysNum <= 3650;
  const reasonValid = reason.trim().length > 0;
  const canSubmit = daysValid && reasonValid && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const result = await createGrant({ requesterEmail }, userId, {
      tier,
      days: daysNum,
      reason: reason.trim(),
    });
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
      title="Grant tier"
      subtitle={userEmail}
      icon="gift"
      iconTint={colors.primary}
      dismissable={!submitting}
      footer={
        <>
          <DialogButton label="Cancel" onPress={onClose} variant="secondary" flex disabled={submitting} />
          <DialogButton label="Grant" onPress={handleSubmit} disabled={!canSubmit} loading={submitting} flex />
        </>
      }
    >
      <LabeledField label="Tier">
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["pro", "premium"] as GrantTier[]).map((t) => {
            const active = tier === t;
            return (
              <TouchableOpacity
                key={t}
                onPress={() => setTier(t)}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 10,
                  borderWidth: 1.5,
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.primary + "18" : "transparent",
                  alignItems: "center",
                }}
                disabled={submitting}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: "Inter_700Bold",
                    color: active ? colors.primary : colors.mutedForeground,
                  }}
                >
                  {t.toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </LabeledField>

      <LabeledField label="Duration (days)" hint="Max 3650 days (~10 years)">
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 6 }}>
          {PRESET_DAYS.map((n) => (
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
                {n}d
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={inputStyle}
          value={days}
          onChangeText={setDays}
          keyboardType="number-pad"
          placeholder="30"
          placeholderTextColor={colors.mutedForeground}
          editable={!submitting}
        />
      </LabeledField>

      <LabeledField label="Reason" hint="Required — shows in the audit log">
        <TextInput
          style={[inputStyle, { minHeight: 64, textAlignVertical: "top" }]}
          value={reason}
          onChangeText={setReason}
          placeholder="e.g. compensation for incident #42"
          placeholderTextColor={colors.mutedForeground}
          multiline
          editable={!submitting}
        />
      </LabeledField>

      <ErrorBanner message={error} />
    </DialogShell>
  );
}
