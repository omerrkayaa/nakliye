import { BODY_TYPES, VEHICLE_TYPES } from "@nakliye/shared";
import { useState } from "react";
import { ScrollView, Text } from "react-native";
import { Badge, Button, Card, Muted, Status, s } from "@/components/ui";
import { API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Vehicle } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const ROLE_LABELS = { carrier: "Nakliyeci", shipper: "Yük sahibi", admin: "Yönetici" } as const;

/** A15 (ilk hâli) — Profil: hesap bilgisi, araçlar, çıkış */
export default function Profil() {
  const { me, signOut } = useAuth();
  const isCarrier = me?.roles.includes("carrier") ?? false;
  const [busy, setBusy] = useState(false);
  if (!me) return null;

  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
      <Card>
        <Text accessibilityRole="header" style={s.title}>
          {me.company?.title ?? me.name ?? "Adsız kullanıcı"}
        </Text>
        <Muted>{me.phone}</Muted>
        <Muted>{me.roles.map((r) => ROLE_LABELS[r]).join(" · ")}</Muted>
        {me.verified ? <Badge tone="ok" icon="shield-checkmark" label="Doğrulanmış" /> : <Badge tone="idle" icon="shield-outline" label="Henüz doğrulanmadı" />}
      </Card>

      {isCarrier && <Vehicles />}

      <Button
        title="Çıkış yap"
        variant="outline"
        icon="log-out-outline"
        busy={busy}
        onPress={async () => {
          setBusy(true);
          await signOut();
        }}
      />
      {__DEV__ && <Muted style={{ textAlign: "center", fontSize: 12 }}>API: {API_URL}</Muted>}
    </ScrollView>
  );
}

function Vehicles() {
  const { data, error, loading, reload } = useApi<Vehicle[]>("/vehicles");
  return (
    <Card>
      <Text style={s.label}>Araçlarım</Text>
      {data === null ? (
        <Status loading={loading} error={error} onRetry={reload} />
      ) : data.length === 0 ? (
        <Muted>Kayıtlı aracınız yok. (Araç ekleme ekranı sıradaki dilimde.)</Muted>
      ) : (
        data.map((v) => (
          <Text key={v.id} style={s.text}>
            {v.plate} · {VEHICLE_TYPES[v.vehicleType]} · {BODY_TYPES[v.bodyType]} · {v.capacityTon} ton
          </Text>
        ))
      )}
    </Card>
  );
}
