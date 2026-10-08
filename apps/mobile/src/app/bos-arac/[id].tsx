import { CAPACITY_STATUS_LABELS } from "@nakliye/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { LoadCard, useCall } from "@/components/load-card";
import { Badge, Button, Card, ErrorText, Muted, Status, s } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { confirm } from "@/lib/confirm";
import { capacityRoute, dayRange } from "@/lib/format";
import type { Capacity, CapacityMatch } from "@/lib/types";
import { useApi } from "@/lib/use-api";

/** Boş araç ilanı: uyan yükler (eşleştirme BR-20) ve kapatma */
export default function BosAracDetay() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const { data: cap, error, loading, reload, setData } = useApi<Capacity>(`/capacity/${id}`);
  const active = cap?.status === "aktif";
  const matches = useApi<{ items: CapacityMatch[] }>(active ? `/capacity/${id}/matches` : null);
  const { call, busyId } = useCall();
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!cap) return <Status loading={loading} error={error} onRetry={reload} />;

  async function close(reason: "doldu" | "iptal") {
    const text = reason === "doldu" ? "Araç doldu olarak kapatılsın mı? Artık eşleşme bildirimi gelmez." : "Boş araç ilanı iptal edilsin mi?";
    if (!(await confirm("İlanı kapat", text, "Kapat"))) return;
    setBusy(reason);
    setActionError(null);
    try {
      setData(await api<Capacity>(`/capacity/${id}/close`, { method: "POST", body: { reason } }));
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Kapatılamadı");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
      <Card>
        <Text style={[s.text, { fontWeight: "700" }]}>{capacityRoute(cap)}</Text>
        <Muted>
          {dayRange(cap.availableFrom, cap.availableTo)} · {cap.vehicle.plate} · {cap.vehicle.capacityTon} ton
        </Muted>
        {active ? <Badge tone="ok" icon="radio-button-on" label="Aktif" /> : <Badge tone="idle" icon="pause-circle-outline" label={CAPACITY_STATUS_LABELS[cap.status]} />}
        {actionError && <ErrorText>{actionError}</ErrorText>}
        {active && (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button title="Araç doldu" variant="outline" icon="checkmark-done" busy={busy === "doldu"} onPress={() => close("doldu")} style={{ flex: 1 }} />
            <Button title="İptal et" variant="danger" busy={busy === "iptal"} onPress={() => close("iptal")} style={{ flex: 1 }} />
          </View>
        )}
      </Card>

      {active && (
        <>
          <Text accessibilityRole="header" style={s.title}>
            Uygun yükler
          </Text>
          {matches.data === null ? (
            <Status loading={matches.loading} error={matches.error} onRetry={matches.reload} />
          ) : matches.data.items.length === 0 ? (
            <Muted>Şu an uyan teyitli yük yok. Yeni yük gelince bildirim alırsınız.</Muted>
          ) : (
            matches.data.items.map((m) => (
              <View key={m.loadId} style={{ gap: 4 }}>
                <Muted>
                  Yükleme yeri {Math.round(m.originKm)} km uzakta{m.destKm !== null ? ` · varış hedefinize ${Math.round(m.destKm)} km` : ""}
                </Muted>
                <LoadCard
                  load={{ ...m, id: m.loadId, note: null }}
                  onPress={() => router.push(`/yuk/${m.loadId}`)}
                  onCall={me?.roles.includes("carrier") ? () => call(m.loadId) : undefined}
                  calling={busyId === m.loadId}
                />
              </View>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}
