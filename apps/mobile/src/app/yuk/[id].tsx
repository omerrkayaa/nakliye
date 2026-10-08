import { BODY_TYPES, VEHICLE_TYPES } from "@nakliye/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { ConfirmBadge, loadSpec, priceText, Route, useCall } from "@/components/load-card";
import { Badge, Button, Card, Chip, ErrorText, Field, Muted, Status, s } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { shareLoad } from "@/lib/share";
import { dayRange } from "@/lib/format";
import { C } from "@/lib/theme";
import type { Load, Vehicle } from "@/lib/types";
import { useApi } from "@/lib/use-api";

/** A7 — Yük detayı: rota, tarih, yük bilgisi, fiyat, yük sahibi; Ara / Teklif ver */
export default function YukDetay() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const isCarrier = me?.roles.includes("carrier") ?? false;
  const { data: load, error, loading, reload } = useApi<Load>(`/loads/${id}`);
  const { call, busyId } = useCall();

  if (!load) return <Status loading={loading} error={error} onRetry={reload} />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Card>
          <Route load={load} />
          <Text style={[s.text, { fontWeight: "600" }]}>Yükleme: {dayRange(load.loadFrom, load.loadTo)}</Text>
          <Muted>{loadSpec(load)}</Muted>
          <Text style={{ fontSize: 22, fontWeight: "800", color: C.primary }}>{priceText(load)}</Text>
          {load.note && <Text style={s.text}>{load.note}</Text>}
          <ConfirmBadge load={load} />
          <Button title="Paylaş" icon="share-social-outline" variant="outline" onPress={() => shareLoad(load)} />
        </Card>

        <Card>
          <Text style={s.label}>Yük sahibi</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <Text style={s.text}>{load.shipper.displayName ?? "Yük sahibi"}</Text>
            {load.shipper.verified && <Badge tone="ok" icon="shield-checkmark" label="Doğrulanmış" />}
          </View>
          <Muted>{load.shipper.phoneMasked}</Muted>
          {isCarrier && <Button title="Ara" icon="call" variant="call" busy={busyId === load.id} onPress={() => call(load.id)} />}
        </Card>

        {isCarrier ? <OfferForm load={load} /> : <Muted>Teklif vermek için hesabınızda nakliyeci rolü olmalı.</Muted>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function OfferForm({ load }: { load: Load }) {
  const { data: vehicles, error: vError, loading: vLoading, reload } = useApi<Vehicle[]>("/vehicles");
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [price, setPrice] = useState(load.priceType === "sabit" && load.price ? String(load.price) : "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  // Tek araç varsa seçili gelsin (3 dokunuşta iş)
  const chosen = vehicleId ?? (vehicles?.length === 1 ? vehicles[0]!.id : null);

  async function submit() {
    const amount = Number(price.replace(/\./g, "").replace(",", "."));
    if (!chosen) return setError("Teklif için araç seçin");
    if (!Number.isFinite(amount) || amount <= 0) return setError("Geçerli bir fiyat girin (₺)");
    setBusy(true);
    setError(null);
    try {
      await api(`/loads/${load.id}/offers`, { method: "POST", body: { vehicleId: chosen, price: amount, note: note.trim() || undefined } });
      setSent(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Teklif gönderilemedi");
    } finally {
      setBusy(false);
    }
  }

  if (sent)
    return (
      <Card>
        <Badge tone="ok" icon="checkmark-circle" label="Teklifiniz iletildi" />
        <Muted>{"Yük sahibi kabul ederse İşlerim'de görünür ve numaralar karşılıklı açılır."}</Muted>
        <Button title="Tekliflerime git" variant="outline" onPress={() => router.navigate("/isler")} />
      </Card>
    );

  return (
    <Card style={{ gap: 14 }}>
      <Text accessibilityRole="header" style={s.title}>
        Teklif ver
      </Text>
      <View style={{ gap: 8 }}>
        <Text style={s.label}>Araç</Text>
        {vehicles === null ? (
          <Status loading={vLoading} error={vError} onRetry={reload} />
        ) : vehicles.length === 0 ? (
          <Muted>Kayıtlı aracınız yok. Teklif için önce araç ekleyin (Profil).</Muted>
        ) : (
          vehicles.map((v) => (
            <Chip
              key={v.id}
              selected={chosen === v.id}
              onPress={() => setVehicleId(v.id)}
              label={`${v.plate} · ${VEHICLE_TYPES[v.vehicleType]} · ${BODY_TYPES[v.bodyType]} · ${v.capacityTon} t`}
            />
          ))
        )}
      </View>
      <Field label="Fiyat (₺, KDV hariç)" keyboardType="number-pad" value={price} onChangeText={setPrice} placeholder="ör. 24000" />
      <Field label="Not (isteğe bağlı)" value={note} onChangeText={setNote} maxLength={280} multiline placeholder="ör. Yarın sabah yükleyebilirim" style={{ minHeight: 72, textAlignVertical: "top", paddingTop: 12 }} />
      {error && <ErrorText>{error}</ErrorText>}
      <Button title="Teklifi gönder" variant="accent" icon="send" busy={busy} onPress={submit} disabled={!vehicles?.length} />
    </Card>
  );
}
