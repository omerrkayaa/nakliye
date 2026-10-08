import { BODY_TYPES, VEHICLE_TYPES } from "@nakliye/shared";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { DayChips, dayFromToday, DistrictField } from "@/components/place-fields";
import { Button, Card, Chip, ErrorText, Muted, Status, s } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { dayRange } from "@/lib/format";
import { useProvinces } from "@/lib/provinces";
import type { Capacity, Vehicle } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const SPANS = [1, 2, 3, 5, 7];

/** A9 — Boş araç bildir: "Şu tarihte şuradayım, şuraya gidiyorum" */
export default function BosAracYeni() {
  const provinces = useProvinces();
  const { data: vehicles, error: vError, loading: vLoading, reload } = useApi<Vehicle[]>("/vehicles");
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [origin, setOrigin] = useState<number | null>(null);
  const [dest, setDest] = useState<number | null>(null);
  const [from, setFrom] = useState(dayFromToday(0));
  const [span, setSpan] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const chosen = vehicleId ?? (vehicles?.length === 1 ? vehicles[0]!.id : null);
  // Bitiş: başlangıçtan itibaren "span" gün (başlangıç dahil)
  const to = new Date(new Date(`${from}T12:00:00Z`).getTime() + (span - 1) * 86_400_000).toISOString().slice(0, 10);

  async function save() {
    if (!chosen) return setError("Araç seçin");
    if (!origin) return setError("Aracın boşalacağı ilçeyi seçin");
    setBusy(true);
    setError(null);
    try {
      const c = await api<Capacity>("/capacity", {
        method: "POST",
        body: { vehicleId: chosen, originDistrictId: origin, destDistrictId: dest, availableFrom: from, availableTo: to },
      });
      router.replace(`/bos-arac/${c.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Kaydedilemedi");
      setBusy(false);
    }
  }

  if (vehicles === null) return <Status loading={vLoading} error={vError} onRetry={reload} />;
  if (vehicles.length === 0)
    return (
      <View style={{ padding: 16, gap: 12 }}>
        <Muted>Boş araç bildirmek için önce aracınızı ekleyin.</Muted>
        <Button title="Araç ekle" icon="add" onPress={() => router.replace("/arac/yeni")} />
      </View>
    );

  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }} keyboardShouldPersistTaps="handled">
      <Card style={{ gap: 16 }}>
        <View style={{ gap: 6 }}>
          <Text style={s.label}>Araç</Text>
          {vehicles.map((v) => (
            <Chip
              key={v.id}
              selected={chosen === v.id}
              onPress={() => setVehicleId(v.id)}
              label={`${v.plate} · ${VEHICLE_TYPES[v.vehicleType]} · ${BODY_TYPES[v.bodyType]} · ${v.capacityTon} t`}
            />
          ))}
        </View>
        <DistrictField label="Nerede boşalıyor?" provinces={provinces} value={origin} onChange={setOrigin} />
        <DistrictField label="Nereye gitmek istiyorsunuz?" provinces={provinces} value={dest} onChange={setDest} allLabel="Her yer" />
        <DayChips label="Hangi gün boş?" value={from} onChange={setFrom} />
        <View style={{ gap: 6 }}>
          <Text style={s.label}>Kaç gün bekleyebilirsiniz?</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {SPANS.map((n) => (
              <Chip key={n} label={`${n} gün`} selected={span === n} onPress={() => setSpan(n)} />
            ))}
          </View>
          <Muted>Müsait: {dayRange(from, to)}</Muted>
        </View>
      </Card>
      {error && <ErrorText>{error}</ErrorText>}
      <Button title="Boş aracı bildir" icon="megaphone" variant="accent" busy={busy} onPress={save} />
    </ScrollView>
  );
}
