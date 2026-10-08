import { trDay } from "@nakliye/shared";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Picker } from "@/components/picker";
import { Chip, Muted, s } from "@/components/ui";
import { dayText } from "@/lib/format";
import type { Province } from "@/lib/types";

/** İl → ilçe seçimi. allLabel verilirse "her yer" (null) seçilebilir. */
export function DistrictField({
  label,
  provinces,
  value,
  onChange,
  allLabel,
}: {
  label: string;
  provinces: Province[];
  value: number | null;
  onChange: (districtId: number | null) => void;
  allLabel?: string;
}) {
  // İlçe kimliği = plaka × 100 + sıra (rehber §3): seçili ilçenin ili kimlikten bulunur
  const [provinceId, setProvinceId] = useState<number | null>(value ? Math.floor(value / 100) : null);
  const province = provinces.find((p) => p.id === provinceId);
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Picker
          label="İl"
          items={provinces}
          value={provinceId}
          allLabel={allLabel}
          onChange={(id) => {
            setProvinceId(id);
            onChange(null);
          }}
        />
        <Picker label="İlçe" items={province?.districts ?? []} value={value} onChange={onChange} disabled={!province} />
      </View>
      {allLabel && province && !value && <Muted>İlçe seçmezseniz “{allLabel}” sayılır.</Muted>}
    </View>
  );
}

const DAY_MS = 86_400_000;

/** Bugünden itibaren n günün TR tarihi (YYYY-AA-GG) */
export const dayFromToday = (n: number, now = new Date()) => trDay(new Date(now.getTime() + n * DAY_MS));

/** Gün seçimi: Bugün, Yarın, sonraki günler — takvim yerine tek dokunuş (şoför dostu) */
export function DayChips({ label, value, onChange, days = 7 }: { label: string; value: string; onChange: (day: string) => void; days?: number }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {Array.from({ length: days }, (_, i) => {
          const d = dayFromToday(i);
          const text = i === 0 ? "Bugün" : i === 1 ? "Yarın" : dayText(d);
          return <Chip key={d} label={text} selected={value === d} onPress={() => onChange(d)} />;
        })}
      </ScrollView>
    </View>
  );
}
