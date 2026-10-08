import { ROUTE_ALERT_PARAMS, VEHICLE_TYPES, type VehicleType } from "@nakliye/shared";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { DistrictField } from "@/components/place-fields";
import { Button, Card, Chip, ErrorText, Muted, s } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useProvinces } from "@/lib/provinces";

// Hepsi ROUTE_ALERT_PARAMS sınırları (10–200 km) içinde; varsayılanlar eşleştirmeyle aynı (50 / 80)
const RADII = [25, 50, 80, 150];

/** A8 — Yeni rota alarmı: "Şu güzergâhta yük çıkınca haber ver" (FR-22) */
export default function AlarmYeni() {
  const provinces = useProvinces();
  const [origin, setOrigin] = useState<number | null>(null);
  const [originKm, setOriginKm] = useState(ROUTE_ALERT_PARAMS.defaultOriginRadiusKm);
  const [dest, setDest] = useState<number | null>(null);
  const [destKm, setDestKm] = useState(ROUTE_ALERT_PARAMS.defaultDestRadiusKm);
  const [vehicleType, setVehicleType] = useState<VehicleType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!origin) return setError("Kalkış ilçesini seçin");
    setBusy(true);
    setError(null);
    try {
      await api("/alerts", {
        method: "POST",
        body: { originDistrictId: origin, originRadiusKm: originKm, destDistrictId: dest, destRadiusKm: destKm, vehicleType },
      });
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Alarm kaydedilemedi");
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }} keyboardShouldPersistTaps="handled">
      <Card style={{ gap: 16 }}>
        <DistrictField
          label="Nereden?"
          provinces={provinces}
          value={origin}
          onChange={(id) => {
            setOrigin(id);
            setError(null);
          }}
        />
        <Radius label="Kalkışa en fazla" value={originKm} onChange={setOriginKm} />
        <DistrictField label="Nereye?" provinces={provinces} value={dest} onChange={setDest} allLabel="Her yer" />
        {dest !== null && <Radius label="Varışa en fazla" value={destKm} onChange={setDestKm} />}
        <View style={{ gap: 6 }}>
          <Text style={s.label}>Araç tipi</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Chip label="Hepsi" selected={vehicleType === null} onPress={() => setVehicleType(null)} />
            {(Object.keys(VEHICLE_TYPES) as VehicleType[]).map((k) => (
              <Chip key={k} label={VEHICLE_TYPES[k]} selected={vehicleType === k} onPress={() => setVehicleType(k)} />
            ))}
          </View>
        </View>
        <Muted>Bu güzergâhta teyitli yeni yük çıkınca bildirim alırsınız.</Muted>
      </Card>
      {error && <ErrorText>{error}</ErrorText>}
      <Button title="Alarmı kur" icon="notifications" variant="accent" busy={busy} onPress={save} />
    </ScrollView>
  );
}

function Radius({ label, value, onChange }: { label: string; value: number; onChange: (km: number) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {RADII.map((km) => (
          <Chip key={km} label={`${km} km`} selected={value === km} onPress={() => onChange(km)} />
        ))}
      </View>
    </View>
  );
}
