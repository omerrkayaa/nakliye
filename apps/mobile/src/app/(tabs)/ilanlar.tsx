import { VISIBLE_LOAD_STATUSES } from "@nakliye/shared";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { Route } from "@/components/load-card";
import { LoadStatusBadge } from "@/components/load-status";
import { Button, Card, ErrorText, Muted, Status } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { dayRange } from "@/lib/format";
import { C } from "@/lib/theme";
import type { MyLoad, Page } from "@/lib/types";
import { useApi } from "@/lib/use-api";

/** A18 — İlanlarım: durum, son teyit, bekleyen teklif; "Hâlâ geçerli" tek dokunuş */
export default function Ilanlar() {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload, setData } = useApi<Page<MyLoad>>(`/loads/mine?page=${page}`);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function stillValid(l: MyLoad) {
    setBusyId(l.id);
    setActionError(null);
    try {
      const updated = await api<MyLoad>(`/loads/${l.id}/confirm`, { method: "POST", body: { answer: "gecerli" } });
      setData((d) => d && { ...d, items: d.items.map((x) => (x.id === l.id ? { ...x, ...updated } : x)) });
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Teyit edilemedi");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <FlatList
      data={data?.items ?? []}
      keyExtractor={(l) => l.id}
      contentContainerStyle={{ padding: 12, gap: 12 }}
      refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} colors={[C.primary]} />}
      ListHeaderComponent={
        <View style={{ gap: 8 }}>
          <Button title="İlan ver" icon="add-circle" variant="accent" onPress={() => router.push("/ilan/yeni")} />
          {actionError && <ErrorText>{actionError}</ErrorText>}
        </View>
      }
      renderItem={({ item: l }) => (
        <Card>
          <Pressable accessibilityRole="button" accessibilityLabel={`İlan: ${l.origin.district} → ${l.dest.district}`} onPress={() => router.push(`/ilanim/${l.id}`)} style={{ gap: 8 }}>
            <Route load={l} />
            <Muted>
              {dayRange(l.loadFrom, l.loadTo)} · {l.weightTon} ton
            </Muted>
            <LoadStatusBadge load={l} />
            {l.pendingOffers > 0 && <Text style={{ fontSize: 16, fontWeight: "700", color: C.accent }}>{l.pendingOffers} teklif bekliyor</Text>}
          </Pressable>
          {VISIBLE_LOAD_STATUSES.includes(l.status) && <Button title="Hâlâ geçerli" icon="checkmark" variant="outline" busy={busyId === l.id} onPress={() => stillValid(l)} />}
        </Card>
      )}
      ListFooterComponent={
        data && (data.hasMore || page > 1) ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            {page > 1 && <Button title="Önceki" variant="outline" onPress={() => setPage(page - 1)} style={{ flex: 1 }} />}
            {data.hasMore && <Button title="Sonraki" variant="outline" onPress={() => setPage(page + 1)} style={{ flex: 1 }} />}
          </View>
        ) : null
      }
      ListEmptyComponent={<Status loading={loading} error={error} onRetry={reload} empty="Henüz ilanınız yok. Yükünüzü ilan edin, nakliyeciler teklif versin." />}
    />
  );
}
