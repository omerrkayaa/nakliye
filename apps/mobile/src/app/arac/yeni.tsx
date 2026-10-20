import { BODY_TYPES, plateSchema, VEHICLE_TYPES, type BodyType, type VehicleType } from "@nakliye/shared";
import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { Choice } from "@/components/choice";
import { Button, Card, ErrorText, Field, Muted } from "@/components/ui";
import { VehiclePreview } from "@/components/vehicle-preview";
import { api, ApiError } from "@/lib/api";

/** A5 — Araç ekle: plaka, araç tipi, kasa tipi, tonaj. Belge fotoğrafları dosya deposu kararıyla. */
export default function AracYeni() {
  const [plate, setPlate] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType | null>(null);
  const [bodyType, setBodyType] = useState<BodyType | null>(null);
  const [ton, setTon] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const e: Record<string, string> = {};
    const p = plateSchema.safeParse(plate);
    if (!p.success) e.plate = p.error.issues[0]?.message ?? "Geçerli bir plaka girin";
    if (!vehicleType) e.vehicleType = "Araç tipini seçin";
    if (!bodyType) e.bodyType = "Kasa tipini seçin";
    const capacityTon = Number(ton.replace(",", "."));
    if (!Number.isFinite(capacityTon) || capacityTon <= 0 || capacityTon > 60) e.ton = "Tonajı 0–60 arasında girin";
    setErrors(e);
    if (Object.keys(e).length) return;

    setBusy(true);
    setError(null);
    try {
      await api("/vehicles", { method: "POST", body: { plate, vehicleType, bodyType, capacityTon } });
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Araç kaydedilemedi");
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 16 }}>
          <Field label="Plaka" placeholder="ör. 09 ABC 123" autoCapitalize="characters" autoCorrect={false} value={plate} onChangeText={setPlate} error={errors.plate} />
          <Choice label="Araç tipi" options={VEHICLE_TYPES} value={vehicleType} onChange={setVehicleType} error={errors.vehicleType} />
          <Choice label="Kasa tipi" options={BODY_TYPES} value={bodyType} onChange={setBodyType} error={errors.bodyType} />
          <VehiclePreview vehicle={vehicleType} body={bodyType} />
          <Field label="Taşıma kapasitesi (ton)" keyboardType="decimal-pad" placeholder="ör. 25" value={ton} onChangeText={setTon} error={errors.ton} />
          <Muted>Ruhsat, K belgesi ve SRC fotoğrafları sonraki sürümde eklenecek.</Muted>
        </Card>
        {error && <ErrorText>{error}</ErrorText>}
        <Button title="Aracı kaydet" icon="checkmark" busy={busy} onPress={save} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
