import { NOTIFICATION_TYPES } from "@nakliye/shared";
import { router, type Href } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { Button, Card, ErrorText, Muted, Status, s } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { confirm } from "@/lib/confirm";
import { ago } from "@/lib/format";
import { C } from "@/lib/theme";
import type { Notification, Page } from "@/lib/types";
import { useApi } from "@/lib/use-api";

/** Bildirime dokununca gidilecek ekran (bildirimin data alanı API'deki notify çağrılarından) */
function target(n: Notification): Href | null {
  const d = n.data;
  if (d.jobId) return `/is/${d.jobId}`;
  // Yük sahibine giden: kendi ilanı
  if (n.type === "offer_new" || n.type === "match_for_shipper" || n.type === "load_confirm") return d.loadId ? `/ilanim/${d.loadId}` : null;
  // Sonuçlanmayan teklif: ilan kapanmış olabilir, teklif listesine
  if (n.type === "offer_result") return "/isler";
  if (d.loadId) return `/yuk/${d.loadId}`;
  if (d.capacityId) return `/bos-arac/${d.capacityId}`;
  return null;
}

/** A14 — Bildirimler: eşleşmeler, teklif cevapları, teyit soruları (teyit buradan tek dokunuşla) */
export default function Bildirimler() {
  const { data, error, loading, reload, setData } = useApi<Page<Notification> & { unread: number }>("/notifications");
  const [answered, setAnswered] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function markLocal(id: string) {
    setData((d) => d && { ...d, unread: Math.max(0, d.unread - 1), items: d.items.map((x) => (x.id === id && !x.readAt ? { ...x, readAt: new Date().toISOString() } : x)) });
  }

  async function open(n: Notification) {
    if (!n.readAt) {
      markLocal(n.id);
      void api(`/notifications/${n.id}/read`, { method: "POST" }).catch(() => {});
    }
    const to = target(n);
    if (to) router.push(to);
  }

  async function readAll() {
    setBusy("all");
    try {
      await api("/notifications/read-all", { method: "POST" });
      await reload();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "İşaretlenemedi");
    } finally {
      setBusy(null);
    }
  }

  async function answer(n: Notification, a: "gecerli" | "arac_bulundu") {
    if (a === "arac_bulundu" && !(await confirm("Araç bulundu mu?", "İlan yayından kalkar ve bekleyen teklifler kapanır.", "Evet, kapat"))) return;
    setBusy(n.id + a);
    setActionError(null);
    try {
      await api(`/loads/${n.data.loadId}/confirm`, { method: "POST", body: { answer: a } });
      setAnswered((m) => ({ ...m, [n.id]: a === "gecerli" ? "İlan teyit edildi" : "İlan kapatıldı" }));
      if (!n.readAt) {
        markLocal(n.id);
        void api(`/notifications/${n.id}/read`, { method: "POST" }).catch(() => {});
      }
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Cevap gönderilemedi");
    } finally {
      setBusy(null);
    }
  }

  return (
    <FlatList
      data={data?.items ?? []}
      keyExtractor={(n) => n.id}
      contentContainerStyle={{ padding: 12, gap: 8 }}
      refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} colors={[C.primary]} />}
      ListHeaderComponent={
        data && data.items.length > 0 ? (
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <Muted>{data.unread > 0 ? `${data.unread} okunmamış` : "Hepsi okundu"}</Muted>
              {data.unread > 0 && <Button title="Tümünü okundu say" variant="outline" busy={busy === "all"} onPress={readAll} />}
            </View>
            {actionError && <ErrorText>{actionError}</ErrorText>}
          </View>
        ) : null
      }
      renderItem={({ item: n }) => {
        const unread = !n.readAt;
        const confirmable = n.type === "load_confirm" && n.data.loadId;
        return (
          <Card style={unread ? { borderColor: C.primary, borderLeftWidth: 4 } : undefined}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${unread ? "Okunmamış: " : ""}${n.title}`}
              onPress={() => open(n)}
              style={{ gap: 4 }}
            >
              <Muted style={{ fontSize: 13 }}>
                {NOTIFICATION_TYPES[n.type]} · {ago(n.createdAt)}
              </Muted>
              <Text style={[s.text, { fontWeight: unread ? "700" : "500" }]}>{n.title}</Text>
              <Muted>{n.body}</Muted>
            </Pressable>
            {confirmable &&
              (answered[n.id] ? (
                <Muted>✓ {answered[n.id]}</Muted>
              ) : (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Button title="Evet, geçerli" icon="checkmark" busy={busy === n.id + "gecerli"} onPress={() => answer(n, "gecerli")} style={{ flex: 1 }} />
                  <Button title="Araç bulundu" variant="outline" busy={busy === n.id + "arac_bulundu"} onPress={() => answer(n, "arac_bulundu")} style={{ flex: 1 }} />
                </View>
              ))}
          </Card>
        );
      }}
      ListEmptyComponent={<Status loading={loading} error={error} onRetry={reload} empty="Henüz bildiriminiz yok." />}
    />
  );
}
