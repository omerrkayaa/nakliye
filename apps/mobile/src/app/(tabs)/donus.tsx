import { CAPACITY_STATUS_LABELS } from "@nakliye/shared";
import { router } from "expo-router";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { Badge, Button, Card, Muted, Status, s } from "@/components/ui";
import { capacityRoute, dayRange } from "@/lib/format";
import { C } from "@/lib/theme";
import type { Capacity, Page } from "@/lib/types";
import { useApi } from "@/lib/use-api";

/** A9/A10 — Dönüş planı: boş araç ilanlarım ve onlara uyan yükler */
export default function Donus() {
  const { data, error, loading, reload } = useApi<Page<Capacity>>("/capacity");
  return (
    <FlatList
      data={data?.items ?? []}
      keyExtractor={(c) => c.id}
      contentContainerStyle={{ padding: 12, gap: 12 }}
      refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} colors={[C.primary]} />}
      ListHeaderComponent={
        <View style={{ gap: 8 }}>
          <Muted>Aracınız nerede, ne zaman boşalıyor? Bildirin; yolunuza uyan yükleri gösterelim ve yük sahiplerine haber verelim.</Muted>
          <Button title="Boş araç bildir" icon="add-circle" variant="accent" onPress={() => router.push("/bos-arac/yeni")} />
          <Button title="Rota alarmlarım" icon="notifications-outline" variant="outline" onPress={() => router.push("/alarm")} />
        </View>
      }
      renderItem={({ item: c }) => (
        <Pressable accessibilityRole="button" accessibilityLabel={`Boş araç: ${capacityRoute(c)}`} onPress={() => router.push(`/bos-arac/${c.id}`)}>
          <Card style={c.status !== "aktif" ? { opacity: 0.7 } : undefined}>
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
      ListEmptyComponent={<Status loading={loading} error={error} onRetry={reload} empty="Henüz boş araç bildirmediniz." />}
    />
  );
}
