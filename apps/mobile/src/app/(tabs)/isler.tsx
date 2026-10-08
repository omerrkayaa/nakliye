import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { jobBadge } from "@/components/job-badge";
import { Route } from "@/components/load-card";
import { Badge, Button, Card, Chip, ErrorText, Muted, Status } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { dayRange, tl } from "@/lib/format";
import { C } from "@/lib/theme";
import type { Job, MyOffer, Page } from "@/lib/types";
import { useApi } from "@/lib/use-api";

type Tab = "offers" | "active" | "past";
const TABS: [Tab, string][] = [
  ["offers", "Tekliflerim"],
  ["active", "Süren işler"],
  ["past", "Geçmiş"],
];

/** A11 — İşlerim: teklif verdiklerim / anlaştıklarım / tamamlananlar */
export default function Isler() {
  const [tab, setTab] = useState<Tab>("offers");
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", gap: 8, padding: 12, paddingBottom: 0 }}>
        {TABS.map(([k, label]) => (
          <Chip key={k} label={label} selected={tab === k} onPress={() => setTab(k)} />
        ))}
      </View>
      {tab === "offers" ? <Offers /> : <Jobs scope={tab} />}
    </View>
  );
}

const OFFER_STATUS = {
  beklemede: { tone: "warn", icon: "hourglass-outline", label: "Cevap bekleniyor" },
  kabul: { tone: "ok", icon: "checkmark-circle", label: "Kabul edildi" },
  ret: { tone: "idle", icon: "close-circle-outline", label: "Kabul edilmedi" },
  geri_cekildi: { tone: "idle", icon: "arrow-undo-outline", label: "Geri çekildi" },
} as const;

function Offers() {
  const { data, error, loading, reload } = useApi<Page<MyOffer>>("/offers");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function withdraw(id: string) {
    setBusyId(id);
    setActionError(null);
    try {
      await api(`/offers/${id}/withdraw`, { method: "POST" });
      await reload();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Teklif geri çekilemedi");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <FlatList
      data={data?.items ?? []}
      keyExtractor={(o) => o.id}
      contentContainerStyle={{ padding: 12, gap: 12 }}
      refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} colors={[C.primary]} />}
      ListHeaderComponent={actionError ? <ErrorText>{actionError}</ErrorText> : null}
      renderItem={({ item: o }) => {
        const st = OFFER_STATUS[o.status];
        return (
          <Card>
            <Pressable accessibilityRole="button" onPress={() => router.push(`/yuk/${o.load.id}`)} style={{ gap: 8 }}>
              <Route load={o.load} />
              <Muted>
                {dayRange(o.load.loadFrom, o.load.loadTo)} · {o.load.weightTon} ton
              </Muted>
              <Text style={{ fontSize: 18, fontWeight: "800", color: C.primary }}>Teklifim: {tl(o.price)}</Text>
              <Badge tone={st.tone} icon={st.icon} label={st.label} />
            </Pressable>
            {o.status === "beklemede" && <Button title="Teklifi geri çek" variant="danger" busy={busyId === o.id} onPress={() => withdraw(o.id)} />}
          </Card>
        );
      }}
      ListEmptyComponent={<Status loading={loading} error={error} onRetry={reload} empty="Henüz teklif vermediniz. Yükler sekmesinden bir yüke teklif verin." />}
    />
  );
}

function Jobs({ scope }: { scope: "active" | "past" }) {
  const { data, error, loading, reload } = useApi<Page<Job>>(`/jobs?scope=${scope}`);
  return (
    <FlatList
      data={data?.items ?? []}
      keyExtractor={(j) => j.id}
      contentContainerStyle={{ padding: 12, gap: 12 }}
      refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} colors={[C.primary]} />}
      renderItem={({ item: j }) => (
        <Pressable accessibilityRole="button" onPress={() => router.push(`/is/${j.id}`)}>
          <Card>
            <Route load={j.load} />
            <Muted>
              {dayRange(j.load.loadFrom, j.load.loadTo)} · {j.vehicle.plate}
              {j.agreedPrice ? ` · ${tl(j.agreedPrice)}` : ""}
            </Muted>
            {jobBadge(j.status)}
          </Card>
        </Pressable>
      )}
      ListEmptyComponent={
        <Status
          loading={loading}
          error={error}
          onRetry={reload}
          empty={scope === "active" ? "Süren işiniz yok. Teklifiniz kabul edilince burada görünür." : "Geçmiş işiniz yok."}
        />
      }
    />
  );
}
