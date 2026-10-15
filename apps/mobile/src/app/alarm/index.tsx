import Ionicons from "@expo/vector-icons/Ionicons";
import { VEHICLE_TYPES } from "@nakliye/shared";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, Switch, Text, View } from "react-native";
import { Button, Card, ErrorText, Muted, Status, s } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { confirm } from "@/lib/confirm";
import { place } from "@/lib/format";
import { C, TOUCH } from "@/lib/theme";
import type { RouteAlert } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const routeText = (a: RouteAlert) =>
  `${place(a.origin)} (${a.originRadiusKm} km) → ${a.dest ? `${place(a.dest)} (${a.destRadiusKm} km)` : "Her yer"}`;

/** A8 — Rota alarmları: kayıtlı güzergâhlar, aç/kapat, sil */
export default function Alarmlar() {
  const { data, error, loading, reload, setData } = useApi<{ items: RouteAlert[]; maxActive: number }>("/alerts");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const activeCount = data?.items.filter((a) => a.active).length ?? 0;

  async function toggle(a: RouteAlert) {
    setBusyId(a.id);
    setActionError(null);
    try {
      const updated = await api<RouteAlert>(`/alerts/${a.id}`, { method: "PATCH", body: { active: !a.active } });
      setData((d) => d && { ...d, items: d.items.map((x) => (x.id === a.id ? updated : x)) });
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Alarm güncellenemedi");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(a: RouteAlert) {
    if (!(await confirm("Alarm silinsin mi?", routeText(a), "Sil"))) return;
    setBusyId(a.id);
    setActionError(null);
    try {
      await api(`/alerts/${a.id}`, { method: "DELETE" });
      setData((d) => d && { ...d, items: d.items.filter((x) => x.id !== a.id) });
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Alarm silinemedi");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <FlatList
      data={data?.items ?? []}
      keyExtractor={(a) => a.id}
      contentContainerStyle={{ padding: 12, gap: 12 }}
      refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} colors={[C.primary]} />}
      ListHeaderComponent={
        <View style={{ gap: 8 }}>
          <Muted>Güzergâhınızda teyitli yeni yük çıkınca haber verelim.</Muted>
          <Button title="Yeni alarm" icon="add-circle" variant="accent" onPress={() => router.push("/alarm/yeni")} />
          {data && <Muted>{`${activeCount} / ${data.maxActive} alarm açık`}</Muted>}
          {actionError && <ErrorText>{actionError}</ErrorText>}
        </View>
      }
      renderItem={({ item: a }) => (
        <Card style={a.active ? undefined : { backgroundColor: C.idleBg }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[s.text, { fontWeight: "700" }]}>{routeText(a)}</Text>
              <Muted>{a.vehicleType ? VEHICLE_TYPES[a.vehicleType] : "Tüm araç tipleri"}</Muted>
            </View>
            <Switch
              accessibilityLabel={`Alarm ${a.active ? "açık" : "kapalı"}: ${routeText(a)}`}
              value={a.active}
              disabled={busyId === a.id}
              onValueChange={() => toggle(a)}
              trackColor={{ true: C.primary }}
              thumbColor={C.card}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Alarmı sil: ${routeText(a)}`}
              disabled={busyId === a.id}
              onPress={() => remove(a)}
              style={{ width: TOUCH, height: TOUCH, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="trash-outline" size={22} color={C.danger} />
            </Pressable>
          </View>
        </Card>
      )}
      ListEmptyComponent={<Status loading={loading} error={error} onRetry={reload} empty="Henüz alarm kurmadınız." />}
    />
  );
}
