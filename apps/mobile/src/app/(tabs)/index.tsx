import Ionicons from "@expo/vector-icons/Ionicons";
import { VEHICLE_TYPES, type VehicleType } from "@nakliye/shared";
import { Redirect, router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, ScrollView, View } from "react-native";
import { LoadCard, useCall } from "@/components/load-card";
import { Picker } from "@/components/picker";
import { Badge, Button, Chip, Status } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { readFeed, readRoute, saveFeed, saveRoute } from "@/lib/feed-cache";
import { ago } from "@/lib/format";
import { useProvinces } from "@/lib/provinces";
import { C } from "@/lib/theme";
import type { Load, Page } from "@/lib/types";

/** İlk sekme: yalnız yük sahibi olan kullanıcı yük akışını değil kendi ilanlarını görür */
export default function YuklerTab() {
  const { me } = useAuth();
  if (!me?.roles.includes("carrier")) return <Redirect href="/ilanlar" />;
  return <Yukler />;
}

/** A6 — Yük akışı: Nereden → Nereye, araç tipi çipleri, kart listesi */
function Yukler() {
  const { me } = useAuth();
  const provinces = useProvinces();
  const { call, busyId } = useCall();
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [vehicle, setVehicle] = useState<VehicleType | null>(null);
  // Son seçilen rota cihazdan okunana kadar liste istenmez (önce filtresiz sonra filtreli iki istek ve titreme olmasın)
  const [routeReady, setRouteReady] = useState(false);
  const [items, setItems] = useState<Load[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Ağ yokken gösterilen kayıtlı listenin zamanı (null: liste canlı)
  const [staleAt, setStaleAt] = useState<string | null>(null);

  const load = useCallback(
    async (p: number) => {
      const q = new URLSearchParams({ page: String(p) });
      if (from) q.set("fromProvinceId", String(from));
      if (to) q.set("toProvinceId", String(to));
      if (vehicle) q.set("vehicleType", vehicle);
      setLoading(true);
      setError(null);
      try {
        const res = await api<Page<Load>>(`/loads?${q}`);
        setItems((cur) => (p === 1 ? res.items : [...cur, ...res.items]));
        setPage(p);
        setHasMore(res.hasMore);
        setStaleAt(null);
        if (p === 1) void saveFeed({ from, to, vehicle }, res.items);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Yükler alınamadı");
        if (p === 1) {
          // İlk sayfa gelmediyse eldeki liste bu filtreye ait değil: göstermeye devam etme.
          // Bağlantı yoksa son kayıtlı liste yalnız aynı filtreyle alındıysa gösterilir (hatırlanan rotada da çalışsın).
          const cached = e instanceof ApiError && e.status === 0 ? await readFeed({ from, to, vehicle }) : null;
          setItems(cached?.items ?? []);
          setHasMore(false);
          setStaleAt(cached?.at ?? null);
        }
      } finally {
        setLoading(false);
      }
    },
    [from, to, vehicle],
  );

  // Son seçilen Nereden/Nereye (NFR-07: aynı güzergâhta çalışan şoför rotayı her açılışta yeniden seçmesin)
  useEffect(() => {
    void readRoute().then((r) => {
      setFrom(r.from);
      setTo(r.to);
      setRouteReady(true);
    });
  }, []);
  useEffect(() => {
    if (routeReady) void saveRoute({ from, to });
  }, [routeReady, from, to]);

  // Filtre değişince ilk sayfayı çek (istek dış sistemle eşitleme; yükleniyor durumu burada açılır)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (routeReady) void load(1);
  }, [load, routeReady]);

  const canCall = me?.roles.includes("carrier");

  return (
    <FlatList
      data={items}
      keyExtractor={(l) => l.id}
      contentContainerStyle={{ padding: 12, gap: 12 }}
      refreshControl={<RefreshControl refreshing={loading && page === 1 && items.length > 0} onRefresh={() => load(1)} colors={[C.primary]} />}
      ListHeaderComponent={
        <View style={{ gap: 10 }}>
          {staleAt && <Badge tone="warn" icon="cloud-offline-outline" label={`Çevrimdışısınız · son güncelleme ${ago(staleAt)}; ilanlar değişmiş olabilir`} />}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Picker label="Nereden" items={provinces} allLabel="Her yer" value={from} onChange={setFrom} />
            <Ionicons name="arrow-forward" size={20} color={C.muted} />
            <Picker label="Nereye" items={provinces} allLabel="Her yer" value={to} onChange={setTo} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {(Object.keys(VEHICLE_TYPES) as VehicleType[]).map((v) => (
              <Chip key={v} label={VEHICLE_TYPES[v]} selected={vehicle === v} onPress={() => setVehicle(vehicle === v ? null : v)} />
            ))}
          </ScrollView>
        </View>
      }
      renderItem={({ item }) => (
        <LoadCard
          load={item}
          onPress={() => router.push(`/yuk/${item.id}`)}
          onCall={canCall ? () => call(item.id) : undefined}
          calling={busyId === item.id}
        />
      )}
      ListEmptyComponent={
        <Status loading={loading} error={error} onRetry={() => load(1)} empty="Bu filtreye uyan teyitli yük yok. Filtreyi genişletin ya da sonra tekrar bakın." />
      }
      ListFooterComponent={
        items.length > 0 ? (
          hasMore ? (
            <Button title="Daha fazla yük" variant="outline" busy={loading} onPress={() => load(page + 1)} />
          ) : (
            <Status error={error} />
          )
        ) : null
      }
    />
  );
}
