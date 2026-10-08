import { CARGO_TYPES, JOB_PARAMS } from "@nakliye/shared";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, ScrollView, Text, View } from "react-native";
import { jobBadge } from "@/components/job-badge";
import { Route } from "@/components/load-card";
import { Badge, Button, Card, ErrorText, Field, Muted, Status, s } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { dayRange, tl } from "@/lib/format";
import type { Job } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const BEFORE_DELIVERY = ["anlasildi", "yuklendi", "yolda"];

/** A12 — İş detayı ve teslim: durum adımları, alıcıdan alınan kodla teslim (F3) */
export default function IsDetay() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: job, error, loading, reload, setData } = useApi<Job>(`/jobs/${id}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!job) return <Status loading={loading} error={error} onRetry={reload} />;

  async function act(key: string, path: string, body?: unknown) {
    setBusy(key);
    setActionError(null);
    try {
      const updated = await api<Job>(`/jobs/${id}/${path}`, { method: "POST", body });
      setData(updated);
      setCode("");
      setCancelOpen(false);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "İşlem yapılamadı");
      await reload();
    } finally {
      setBusy(null);
    }
  }

  const carrier = job.role === "carrier";
  const open = BEFORE_DELIVERY.includes(job.status);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Card>
          {jobBadge(job.status)}
          <Route load={job.load} />
          <Text style={[s.text, { fontWeight: "600" }]}>Yükleme: {dayRange(job.load.loadFrom, job.load.loadTo)}</Text>
          <Muted>
            {CARGO_TYPES[job.load.cargoType]} · {job.load.weightTon} ton · {job.vehicle.plate}
          </Muted>
          {job.agreedPrice !== null && <Text style={[s.title]}>{tl(job.agreedPrice)}</Text>}
          {job.load.note && <Text style={s.text}>{job.load.note}</Text>}
          {job.cancelReason && <Muted>İptal sebebi: {job.cancelReason}</Muted>}
        </Card>

        <Card>
          <Text style={s.label}>{carrier ? "Yük sahibi" : "Nakliyeci"}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <Text style={s.text}>{job.counterpart.displayName ?? "—"}</Text>
            {job.counterpart.verified && <Badge tone="ok" icon="shield-checkmark" label="Doğrulanmış" />}
          </View>
          <Button title={`Ara · ${job.counterpart.phone}`} icon="call" variant="call" onPress={() => Linking.openURL(`tel:${job.counterpart.phone}`)} />
        </Card>

        {actionError && <ErrorText>{actionError}</ErrorText>}

        {carrier && open && (
          <Card style={{ gap: 12 }}>
            <Text accessibilityRole="header" style={s.title}>
              Durumu güncelle
            </Text>
            {job.status === "anlasildi" && <Button title="Yüklendi" icon="cube" busy={busy === "yuklendi"} onPress={() => act("yuklendi", "status", { status: "yuklendi" })} />}
            {job.status !== "yolda" && <Button title="Yoldayım" icon="navigate" busy={busy === "yolda"} onPress={() => act("yolda", "status", { status: "yolda" })} />}

            <Text style={[s.label, { marginTop: 8 }]}>Teslim</Text>
            <Muted>Teslimde alıcıdan 6 haneli teslim kodunu isteyin. Kalan deneme: {job.deliveryCodeAttemptsLeft}/{JOB_PARAMS.deliveryCodeMaxAttempts}</Muted>
            <Field label="Teslim kodu" keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode} placeholder="______" style={{ letterSpacing: 6, fontSize: 22 }} />
            <Button
              title="Teslim ettim"
              variant="accent"
              icon="checkmark-done"
              busy={busy === "deliver"}
              disabled={!/^\d{6}$/.test(code)}
              onPress={() => act("deliver", "deliver", { code })}
            />
          </Card>
        )}

        {open &&
          (cancelOpen ? (
            <Card style={{ gap: 12 }}>
              <Field label="İptal sebebi" value={reason} onChangeText={setReason} multiline maxLength={500} placeholder="ör. Araç arızalandı" style={{ minHeight: 72, textAlignVertical: "top", paddingTop: 12 }} />
              <Muted>İptal, iptal oranınıza yazılır ve güven skorunuzu etkiler.</Muted>
              <Button title="İşi iptal et" variant="danger" busy={busy === "cancel"} onPress={() => act("cancel", "cancel", { reason })} />
              <Button title="Vazgeç" variant="outline" onPress={() => setCancelOpen(false)} />
            </Card>
          ) : (
            <Button title="İşi iptal et" variant="danger" onPress={() => setCancelOpen(true)} />
          ))}

        {job.status === "teslim_edildi" && <Muted>Teslim kaydedildi. Yük sahibi 48 saat içinde itiraz etmezse iş tamamlanır.</Muted>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
