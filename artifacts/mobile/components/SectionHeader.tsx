import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface Props {
  title: string;
  subtitle?: string;
}

export default function SectionHeader({ title, subtitle }: Props) {
  const colors = useColors();
  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      {subtitle && <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 2,
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
});
