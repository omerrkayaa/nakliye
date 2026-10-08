import { BODY_TYPES, CARGO_TYPES, createLoadSchema, VEHICLE_TYPES, type BodyType, type CargoType, type VehicleType } from "@nakliye/shared";
import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { Choice } from "@/components/choice";
import { DayChips, dayFromToday, DistrictField } from "@/components/place-fields";
import { Button, Card, Chip, ErrorText, Field, Muted, s } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { dayRange } from "@/lib/format";
import { useProvinces } from "@/lib/provinces";

const SPANS = [1, 2, 3, 5];
const PRICE_TYPES = { teklif: "Teklif alayım", sabit: "Sabit fiyat" } as const;

// shared şemasının bazı mesajları zod'un İngilizce varsayılanı; alan bazında Türkçe karşılık (web P3 ile aynı)
const FIELD_MESSAGES: Record<string, string> = {
  originDistrictId: "Kalkış ilçesini seçin",
  destDistrictId: "Varış ilçesini seçin",
  cargoType: "Yük cinsini seçin",
  weightTon: "Ağırlığı ton olarak girin (en fazla 60)",
  vehicleType: "Araç tipini seçin",
  price: "Tutarı TL olarak girin",
  note: "Not en fazla 280 karakter olabilir",
};

const num = (v: string) => (v.trim() === "" ? Number.NaN : Number(v.replace(",", ".")));

/** A17 — İlan ver: tek ekran (docs/02: 3 dokunuşta iş). İlk ilanlar moderasyona düşebilir (BR-11). */
export default function IlanYeni() {
  const provinces = useProvinces();
  const [origin, setOrigin] = useState<number | null>(null);
  const [dest, setDest] = useState<number | null>(null);
  const [from, setFrom] = useState(dayFromToday(0));
  const [span, setSpan] = useState(1);
  const [cargoType, setCargoType] = useState<CargoType | null>(null);
  const [weight, setWeight] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType | null>(null);
  const [bodyType, setBodyType] = useState<BodyType | null>(null);
  const [priceType, setPriceType] = useState<keyof typeof PRICE_TYPES>("teklif");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const to = new Date(new Date(`${from}T12:00:00Z`).getTime() + (span - 1) * 86_400_000).toISOString().slice(0, 10);

  async function save() {
    const parsed = createLoadSchema.safeParse({
      originDistrictId: origin ?? Number.NaN,
      destDistrictId: dest ?? Number.NaN,
      loadFrom: from,
      loadTo: to,
      cargoType,
      weightTon: num(weight),
      vehicleType,
      bodyType,
      priceType,
      price: priceType === "sabit" ? num(price) : null,
      note: note.trim() || undefined,
    });
    if (!parsed.success) {
      const e: Record<string, string> = {};
      for (const i of parsed.error.issues) {
        const key = String(i.path[0] ?? "");
        if (!(key in e)) e[key] = i.code === "custom" ? i.message : (FIELD_MESSAGES[key] ?? i.message);
      }
      setErrors(e);
      setError("İşaretli alanları düzeltin.");
      return;
    }
    setErrors({});
    setBusy(true);
    setError(null);
    try {
      const l = await api<{ id: string }>("/loads", { method: "POST", body: parsed.data });
      router.replace(`/ilanim/${l.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "İlan kaydedilemedi");
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 16 }}>
          <DistrictField label="Nereden?" provinces={provinces} value={origin} onChange={setOrigin} />
          {errors.originDistrictId && <ErrorText>{errors.originDistrictId}</ErrorText>}
          <DistrictField label="Nereye?" provinces={provinces} value={dest} onChange={setDest} />
          {errors.destDistrictId && <ErrorText>{errors.destDistrictId}</ErrorText>}
          <DayChips label="Yükleme günü" value={from} onChange={setFrom} />
          <View style={{ gap: 6 }}>
            <Text style={s.label}>Kaç gün içinde yüklenebilir?</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {SPANS.map((n) => (
                <Chip key={n} label={`${n} gün`} selected={span === n} onPress={() => setSpan(n)} />
              ))}
            </View>
            <Muted>Yükleme: {dayRange(from, to)}</Muted>
          </View>
        </Card>

        <Card style={{ gap: 16 }}>
          <Choice label="Yük cinsi" options={CARGO_TYPES} value={cargoType} onChange={setCargoType} error={errors.cargoType} />
          <Field label="Ağırlık (ton)" keyboardType="decimal-pad" placeholder="ör. 20" value={weight} onChangeText={setWeight} error={errors.weightTon} />
          <Choice label="Araç tipi" options={VEHICLE_TYPES} value={vehicleType} onChange={setVehicleType} error={errors.vehicleType} />
          <Choice label="Kasa tipi" options={BODY_TYPES} value={bodyType} onChange={setBodyType} allLabel="Fark etmez" />
        </Card>

        <Card style={{ gap: 16 }}>
          <Choice label="Fiyat" options={PRICE_TYPES} value={priceType} onChange={(k) => k && setPriceType(k)} />
          {priceType === "sabit" && (
            <Field label="Tutar (₺, KDV hariç)" keyboardType="number-pad" placeholder="ör. 24000" value={price} onChangeText={setPrice} error={errors.price} />
          )}
          <Field
            label="Not (isteğe bağlı)"
            multiline
            maxLength={280}
            placeholder="ör. Yükleme 08:00'de, forklift var"
            value={note}
            onChangeText={setNote}
            error={errors.note}
            style={{ minHeight: 72, textAlignVertical: "top", paddingTop: 12 }}
          />
          <Muted>Numaranız ilanda gizli kalır; nakliyeci “Ara” deyince açılır.</Muted>
        </Card>

        {error && <ErrorText>{error}</ErrorText>}
        <Button title="İlanı yayınla" icon="megaphone" variant="accent" busy={busy} onPress={save} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
