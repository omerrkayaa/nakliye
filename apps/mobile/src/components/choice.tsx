import { Text, View } from "react-native";
import { Chip, ErrorText, s } from "@/components/ui";

/** Çiplerle tek seçim (araç tipi, kasa, yük cinsi…). allLabel verilirse başta "fark etmez" seçeneği (null) olur. */
export function Choice<K extends string>({
  label,
  options,
  value,
  onChange,
  error,
  allLabel,
}: {
  label: string;
  options: Record<K, string>;
  value: K | null;
  onChange: (k: K | null) => void;
  error?: string;
  allLabel?: string;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {allLabel && <Chip label={allLabel} selected={value === null} onPress={() => onChange(null)} />}
        {(Object.keys(options) as K[]).map((k) => (
          <Chip key={k} label={options[k]} selected={value === k} onPress={() => onChange(k)} />
        ))}
      </View>
      {error && <ErrorText>{error}</ErrorText>}
    </View>
  );
}
