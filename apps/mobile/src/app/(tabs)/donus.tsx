import { CAPACITY_STATUS_LABELS } from "@nakliye/shared";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { LoadCard, useCall } from "@/components/load-card";
import { Badge, Button, Card, ErrorText, Muted, Status, s } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { capacityRoute, dayRange, dayText } from "@/lib/format";
import { C } from "@/lib/theme";
import type { Capacity, Job, Page, ReturnPlan } from "@/lib/types";
import { useApi } from "@/lib/use-api";

/** Kart başına önce gösterilen öneri sayısı; "Tümünü gör" ile hepsi */
const FIRST = 3;

/**
 * A10 Dönüş planı (F4, FR-24, UC-12) + A9 boş araçlarım. Süren her iş için: varış noktasından eve dönüş yükleri ve
 * dönüş yolu üstündeki ara yükler; "bu rotada yük çıkınca haber ver" rota alarmı kurar.
 */
export default function Donus() {
  const jobs = useApi<Page<Job>>("/jobs?scope=active");
  const [caps, setCaps] = useState<{ items: Capacity[]; page: number; hasMore: boolean } | null>(null);
  const [capError, setCapError] = useState<string | null>(null);
  const [capBusy, setCapBusy] = useState(false);
  // Aşağı çekip yenileyince plan kartları anahtarla yeniden kurulur (odakta kendi kancaları tazeler)
  const [round, setRound] = useState(0);

  const loadCaps = useCallback(async (page: number) => {
    setCapBusy(true);
    setCapError(null);
    try {
      const p = await api<Page<Capacity>>(`/capacity?page=${page}`);
      setCaps((prev) => ({ items: page === 1 ? p.items : [...(prev?.items ?? []), ...p.items], page, hasMore: p.hasMore }));
    } catch (e) {
      setCapError(e instanceof ApiError ? e.message : "Boş araç ilanları yüklenemedi");
    } finally {
      setCapBusy(false);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void loadCaps(1);
    }, [loadCaps]),
  );

  const carrierJobs = jobs.data?.items.filter((j) => j.role === "carrier") ?? [];
  const refresh = () => {
    void jobs.reload();
    void loadCaps(1);
    setRound((n) => n + 1);
  };

  return (
    <FlatList
      data={caps?.items ?? []}
      keyExtractor={(c) => c.id}
      contentContainerStyle={{ padding: 12, gap: 12 }}
      refreshControl={<RefreshControl refreshing={(jobs.loading && !!jobs.data) || (capBusy && !!caps)} onRefresh={refresh} colors={[C.primary]} />}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <Status loading={jobs.loading && !jobs.data} error={jobs.error} onRetry={jobs.reload} />
          {carrierJobs.map((j) => (
            <ReturnPlanCard key={`${j.id}-${round}`} jobId={j.id} />
          ))}
          {jobs.data && carrierJobs.length === 0 && (
            <Muted>Süren bir işiniz olunca varış noktanızdan dönüş yükleri ve yolunuz üstündeki ara yükler burada görünür.</Muted>
          )}
          <Text accessibilityRole="header" style={s.title}>
            Boş araçlarım
          </Text>
          <Muted>Aracınız nerede, ne zaman boşalıyor? Bildirin; yolunuza uyan yükleri gösterelim ve yük sahiplerine haber verelim.</Muted>
          <Button title="Boş araç bildir" icon="add-circle" variant="accent" onPress={() => router.push("/bos-arac/yeni")} />
          <Button title="Rota alarmlarım" icon="notifications-outline" variant="outline" onPress={() => router.push("/alarm")} />
        </View>
      }
      renderItem={({ item: c }) => (
        <Pressable accessibilityRole="button" accessibilityLabel={`Boş araç: ${capacityRoute(c)}`} onPress={() => router.push(`/bos-arac/${c.id}`)}>
          <Card style={c.status !== "aktif" ? { backgroundColor: C.idleBg } : undefined}>
            <Text style={[s.text, { fontWeight: "700" }]}>{capacityRoute(c)}</Text>
            <Muted>
              {dayRange(c.availableFrom, c.availableTo)} · {c.vehicle.plate}
            </Muted>
            {c.status === "aktif" ? (
              <Badge tone="ok" icon="radio-button-on" label="Aktif · uygun yükleri gör" />
            ) : (
              <Badge tone="idle" icon="pause-circle-outline" label={CAPACITY_STATUS_LABELS[c.status]} />
            )}
          </Card>
        </Pressable>
      )}
      ListEmptyComponent={<Status loading={capBusy && !caps} error={capError} onRetry={() => loadCaps(1)} empty="Henüz boş araç bildirmediniz." />}
      ListFooterComponent={
        caps?.hasMore ? <Button title="Daha fazla göster" icon="chevron-down" variant="outline" busy={capBusy} onPress={() => loadCaps(caps.page + 1)} /> : null
      }
    />
  );
}

function ReturnPlanCard({ jobId }: { jobId: string }) {
  const { data, error, loading, reload } = useApi<ReturnPlan>(`/return-plan/${jobId}`);
  const { call, busyId } = useCall();
  const [all, setAll] = useState(false);
  const [alertBusy, setAlertBusy] = useState(false);
  const [alertError, setAlertError] = useState<string | null>(null);
  if (!data) return <Status loading={loading} error={error} onRetry={reload} />;
  const j = data.job;

  async function createAlert() {
    setAlertBusy(true);
    setAlertError(null);
    try {
      const a = data!.alert;
      await api("/alerts", { method: "POST", body: { originDistrictId: a.originDistrictId, destDistrictId: a.destDistrictId, vehicleType: a.vehicleType } });
      await reload();
    } catch (e) {
      setAlertError(e instanceof ApiError ? e.message : "Alarm kurulamadı");
    } finally {
      setAlertBusy(false);
    }
  }

  const ret = all ? data.returnLoads : data.returnLoads.slice(0, FIRST);
  const onRoute = all ? data.onRouteLoads : data.onRouteLoads.slice(0, FIRST);
  const hidden = data.returnLoads.length - ret.length + data.onRouteLoads.length - onRoute.length;
  return (
    <View accessibilityLabel={`Dönüş planı: ${j.origin.district} → ${j.dest.district}`} style={{ gap: 10 }}>
      <Card style={{ gap: 4 }}>
        <Text accessibilityRole="header" style={s.title}>
          Süren iş: {j.origin.district} → {j.dest.district}
        </Text>
        <Muted>
          {j.status === "teslim_edildi" ? `Teslim edildi: ${dayText(j.arrivalDay)}` : `Tahmini varış: ${dayText(j.arrivalDay)}`} · {j.vehicle.plate}
        </Muted>
        {j.routeSource === "kus_ucusu" && <Muted>Yol bilgisi alınamadı; yol üstü öneriler yaklaşık hesaplandı.</Muted>}
      </Card>

      <Text accessibilityRole="header" style={[s.text, { fontWeight: "700" }]}>
        Dönüş: {j.dest.district} → {j.origin.district} ({dayRange(j.window.from, j.window.to)})
      </Text>
      {ret.length === 0 ? (
        <Muted>Şu an bu dönüşe uyan yük yok.</Muted>
      ) : (
        ret.map((l) => <LoadCard key={l.id} load={l} onPress={() => router.push(`/yuk/${l.id}`)} onCall={() => call(l.id)} calling={busyId === l.id} />)
      )}

      <Text accessibilityRole="header" style={[s.text, { fontWeight: "700" }]}>
        Yol üstü ara yük
      </Text>
      {onRoute.length === 0 ? (
        <Muted>Dönüş yolunuz üstünde şu an yük yok.</Muted>
      ) : (
        onRoute.map((l) => (
          <View key={l.id} style={{ gap: 4 }}>
            <LoadCard load={l} onPress={() => router.push(`/yuk/${l.id}`)} onCall={() => call(l.id)} calling={busyId === l.id} />
            <Muted>Yolunuzdan en çok {Math.round(Math.max(l.route.originDevKm, l.route.destDevKm))} km sapma</Muted>
          </View>
        ))
      )}
      {hidden > 0 && <Button title={`Tümünü gör (${hidden} öneri daha)`} variant="outline" icon="chevron-down" onPress={() => setAll(true)} />}

      {data.alert.exists ? (
        <Badge tone="ok" icon="notifications" label="Bu dönüş için rota alarmınız var" />
      ) : (
        <Button title="Bu rotada yük çıkınca haber ver" icon="notifications-outline" variant="outline" busy={alertBusy} onPress={createAlert} />
      )}
      {alertError && <ErrorText>{alertError}</ErrorText>}
    </View>
  );
}
