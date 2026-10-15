import { BODY_TYPES, CARGO_TYPES, VEHICLE_TYPES, VISIBLE_LOAD_STATUSES } from "@nakliye/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { priceText, Route } from "@/components/load-card";
import { LoadStatusBadge } from "@/components/load-status";
import { Badge, Button, Card, ErrorText, Muted, Status, s } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { confirm } from "@/lib/confirm";
import { shareLoad } from "@/lib/share";
import { dayRange, tl } from "@/lib/format";
import { C } from "@/lib/theme";
import type { IncomingOffer, MyLoad } from "@/lib/types";
import { useApi } from "@/lib/use-api";

/** A18 ilan detayı + A19 gelen teklifler: teyit, kapatma, teklif kabulü (teslim kodu bir kez gösterilir) */
export default function IlanimDetay() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: load, error, loading, reload, setData } = useApi<MyLoad>(`/loads/${id}`);
  const moderation = load?.status === "moderasyonda";
  const offers = useApi<{ items: IncomingOffer[] }>(load && !moderation ? `/loads/${id}/offers` : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Kabul yanıtındaki kod yalnız bir kez döner (DB'de hash): ekrandan ayrılana kadar burada tutulur
  const [accepted, setAccepted] = useState<{ jobId: string; deliveryCode: string } | null>(null);

  if (!load) return <Status loading={loading} error={error} onRetry={reload} />;
  const visible = VISIBLE_LOAD_STATUSES.includes(load.status);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "İşlem yapılamadı");
    } finally {
      setBusy(null);
    }
  }

  const stillValid = () => run("confirm", async () => setData(await api<MyLoad>(`/loads/${id}/confirm`, { method: "POST", body: { answer: "gecerli" } })));

  async function close(reason: "arac_bulundu" | "iptal") {
    const ok =
      reason === "arac_bulundu"
        ? await confirm("İlanı kapat", "İlan 'araç bulundu' olarak kapatılsın mı? Bekleyen teklifler sonuçlanır.", "Kapat")
        : await confirm("İlanı iptal et", "İlan iptal edilsin mi? Bu işlem geri alınamaz.", "İptal et");
    if (!ok) return;
    await run(reason, async () => {
      setData(await api<MyLoad>(`/loads/${id}/close`, { method: "POST", body: { reason } }));
      await offers.reload();
    });
  }

  async function accept(o: IncomingOffer) {
    const ok = await confirm(
      "Teklifi kabul et",
      `${tl(o.price)} teklifi kabul edilsin mi? Taşıma oluşur, diğer teklifler reddedilir ve ilan yayından kalkar.`,
      "Kabul et",
    );
    if (!ok) return;
    await run(o.id, async () => {
      const r = await api<{ job: { id: string }; deliveryCode: string }>(`/offers/${o.id}/accept`, { method: "POST" });
      setAccepted({ jobId: r.job.id, deliveryCode: r.deliveryCode });
      await Promise.all([reload(), offers.reload()]);
    });
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
      {accepted && (
        <Card style={{ borderColor: C.ok, borderWidth: 2, gap: 10 }}>
          <Text accessibilityRole="header" style={[s.text, { fontWeight: "700" }]}>
            Teklif kabul edildi, taşıma oluştu
          </Text>
          <Muted>Teslim kodunuz:</Muted>
          <Text accessibilityLabel={`Teslim kodu ${accepted.deliveryCode.split("").join(" ")}`} style={{ fontSize: 32, fontWeight: "800", letterSpacing: 8, color: C.text }}>
            {accepted.deliveryCode}
          </Text>
          <Muted>Bu kodu yükü teslim alacak kişiye verin; nakliyeci teslimde bu kodu girer. Yüklemede şoförle paylaşmayın. Kod SMS ile de gönderildi.</Muted>
          <Button title="Taşımaya git" icon="arrow-forward" onPress={() => router.push(`/is/${accepted.jobId}`)} />
        </Card>
      )}

      <Card>
        <Route load={load} />
        <Text style={[s.text, { fontWeight: "600" }]}>Yükleme: {dayRange(load.loadFrom, load.loadTo)}</Text>
        <Muted>
          {CARGO_TYPES[load.cargoType]} · {load.weightTon} ton · {VEHICLE_TYPES[load.vehicleType]}
          {load.bodyType ? ` · ${BODY_TYPES[load.bodyType]}` : ""}
        </Muted>
        <Text style={[s.title, { color: C.primary }]}>{priceText(load)}</Text>
        {load.note && <Text style={s.text}>{load.note}</Text>}
        <LoadStatusBadge load={load} />
        {moderation && <Muted>Yeni hesapların ilk ilanları kısa bir kontrolden sonra yayına çıkar.</Muted>}
        {actionError && <ErrorText>{actionError}</ErrorText>}
        {visible && <Button title="Hâlâ geçerli" icon="checkmark" busy={busy === "confirm"} onPress={stillValid} />}
        {visible && <Button title="Paylaş (WhatsApp vb.)" icon="share-social-outline" variant="outline" onPress={() => shareLoad(load)} />}
        {(visible || moderation) && (
          <View style={{ flexDirection: "row", gap: 8 }}>
            {visible && <Button title="Araç buldum" variant="outline" busy={busy === "arac_bulundu"} onPress={() => close("arac_bulundu")} style={{ flex: 1 }} />}
            <Button title="İptal et" variant="danger" busy={busy === "iptal"} onPress={() => close("iptal")} style={{ flex: 1 }} />
          </View>
        )}
        {!visible && !moderation && (
          <Button title="Benzerini yayınla" icon="copy-outline" variant="outline" onPress={() => router.push(`/ilan/yeni?kopya=${load.id}`)} />
        )}
      </Card>

      {!moderation && (
        <>
          <Text accessibilityRole="header" style={s.title}>
            Teklifler
          </Text>
          {offers.data === null ? (
            <Status loading={offers.loading} error={offers.error} onRetry={offers.reload} />
          ) : offers.data.items.length === 0 ? (
            <Muted>Henüz teklif yok. Teklif gelince bildirim alırsınız.</Muted>
          ) : (
            // API ucuzdan pahalıya sıralı döner (P5 ile aynı)
            offers.data.items.map((o) => (
              <Card key={o.id} style={o.status === "beklemede" ? undefined : { backgroundColor: C.idleBg }}>
                <Text style={{ fontSize: 22, fontWeight: "800", color: C.text }}>{tl(o.price)}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  <Text style={[s.text, { fontWeight: "600" }]}>{o.carrier.displayName ?? "Nakliyeci"}</Text>
                  {o.carrier.verified && <Badge tone="ok" icon="shield-checkmark" label="Doğrulanmış" />}
                </View>
                <Muted>
                  {o.carrier.rating !== null ? `⭐ ${o.carrier.rating.toFixed(1)} (${o.carrier.ratingCount} puan)` : "Henüz puanı yok"} · {o.carrier.completedJobs} tamamlanan iş
                </Muted>
                <Muted>
                  {VEHICLE_TYPES[o.vehicle.vehicleType]} · {BODY_TYPES[o.vehicle.bodyType]} · {o.vehicle.capacityTon} ton
                </Muted>
                {o.note && <Text style={s.text}>{o.note}</Text>}
                {o.status === "beklemede" ? (
                  visible && <Button title="Kabul et" icon="checkmark-circle" variant="accent" busy={busy === o.id} onPress={() => accept(o)} />
                ) : (
                  <Badge
                    tone={o.status === "kabul" ? "ok" : "idle"}
                    icon={o.status === "kabul" ? "checkmark-circle" : "close-circle-outline"}
                    label={o.status === "kabul" ? "Kabul edildi" : o.status === "ret" ? "Kabul edilmedi" : "Geri çekildi"}
                  />
                )}
              </Card>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}
