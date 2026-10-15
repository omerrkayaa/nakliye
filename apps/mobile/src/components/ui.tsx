import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps, PropsWithChildren, ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";
import { C, TOUCH } from "@/lib/theme";

type Variant = "primary" | "accent" | "call" | "outline" | "danger";

export function Button({
  title,
  onPress,
  variant = "primary",
  icon,
  busy,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  icon?: ComponentProps<typeof Ionicons>["name"];
  busy?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const bg = { primary: C.primary, accent: C.accent, call: C.call, outline: C.card, danger: C.card }[variant];
  const fg = { primary: C.primaryText, accent: C.accentOn, call: "#FFFFFF", outline: C.primary, danger: C.danger }[variant];
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        s.button,
        { backgroundColor: bg, opacity: off ? 0.55 : pressed ? 0.85 : 1 },
        (variant === "outline" || variant === "danger") && { borderWidth: 1, borderColor: variant === "danger" ? C.danger : C.border },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : icon && <Ionicons name={icon} size={20} color={fg} />}
      <Text style={[s.buttonText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[s.chip, selected && { backgroundColor: C.primary, borderColor: C.primary }]}
    >
      {selected && <Ionicons name="checkmark" size={16} color={C.primaryText} />}
      <Text style={[s.chipText, selected && { color: C.primaryText }]}>{label}</Text>
    </Pressable>
  );
}

const TONES = {
  ok: [C.ok, C.okBg],
  warn: [C.warn, C.warnBg],
  idle: [C.idle, C.idleBg],
} as const;

/** Durum rozeti: renk tek başına anlam taşımaz, ikon + metin birlikte (erişilebilirlik) */
export function Badge({ tone, icon, label }: { tone: keyof typeof TONES; icon: ComponentProps<typeof Ionicons>["name"]; label: string }) {
  const [fg, bg] = TONES[tone];
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={14} color={fg} />
      <Text style={[s.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string | null }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={C.muted}
        {...props}
        style={[s.input, error ? { borderColor: C.danger } : null, props.style]}
      />
      {error ? <ErrorText>{error}</ErrorText> : null}
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="alert" style={s.error}>
      {children}
    </Text>
  );
}

export function Muted({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[s.muted, style]}>{children}</Text>;
}

/** Yükleniyor / hata / boş durumları tek yerde */
export function Status({ loading, error, empty, onRetry }: { loading?: boolean; error?: string | null; empty?: string; onRetry?: () => void }) {
  if (loading) return <ActivityIndicator style={{ marginTop: 32 }} size="large" color={C.primary} />;
  if (error)
    return (
      <View style={s.status}>
        <ErrorText>{error}</ErrorText>
        {onRetry && <Button title="Tekrar dene" variant="outline" icon="refresh" onPress={onRetry} />}
      </View>
    );
  if (empty) return <Muted style={{ textAlign: "center", marginTop: 32 }}>{empty}</Muted>;
  return null;
}

export const s = StyleSheet.create({
  button: {
    minHeight: TOUCH,
    borderRadius: 10,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonText: { fontSize: 16, fontWeight: "600" },
  card: { backgroundColor: C.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border, gap: 8 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  chipText: { fontSize: 15, color: C.text },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 13, fontWeight: "600" },
  label: { fontSize: 15, fontWeight: "600", color: C.text },
  input: {
    minHeight: TOUCH,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 17,
    color: C.text,
    backgroundColor: C.card,
  },
  error: { color: C.danger, fontSize: 15 },
  muted: { color: C.muted, fontSize: 15 },
  status: { marginTop: 32, gap: 12, alignItems: "center", paddingHorizontal: 16 },
  title: { fontSize: 20, fontWeight: "700", color: C.text },
  text: { fontSize: 16, color: C.text },
});
