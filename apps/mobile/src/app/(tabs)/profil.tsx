import Ionicons from "@expo/vector-icons/Ionicons";
import { BODY_TYPES, VEHICLE_TYPES } from "@nakliye/shared";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Badge, Button, Card, ErrorText, Muted, Status, s } from "@/components/ui";
import { api, API_URL, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { confirm } from "@/lib/confirm";
import { C, TOUCH } from "@/lib/theme";
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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function remove(v: Vehicle) {
    if (!(await confirm("Araç silinsin mi?", `${v.plate} silinecek. Bu araçla açtığınız boş araç ilanları da kapanır.`, "Sil"))) return;
    setBusyId(v.id);
    setActionError(null);
    try {
      await api(`/vehicles/${v.id}`, { method: "DELETE" });
      await reload();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Araç silinemedi");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <Text style={s.label}>Araçlarım</Text>
      {data === null ? (
        <Status loading={loading} error={error} onRetry={reload} />
      ) : data.length === 0 ? (
        <Muted>Kayıtlı aracınız yok. Teklif vermek ve boş araç bildirmek için araç ekleyin.</Muted>
      ) : (
        data.map((v) => (
          <View key={v.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={[s.text, { flex: 1 }]}>
              {v.plate} · {VEHICLE_TYPES[v.vehicleType]} · {BODY_TYPES[v.bodyType]} · {v.capacityTon} ton
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${v.plate} aracını sil`}
              disabled={busyId === v.id}
              onPress={() => remove(v)}
              style={{ width: TOUCH, height: TOUCH, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="trash-outline" size={22} color={C.danger} />
            </Pressable>
          </View>
        ))
      )}
      {actionError && <ErrorText>{actionError}</ErrorText>}
      <Button title="Araç ekle" icon="add" variant="outline" onPress={() => router.push("/arac/yeni")} />
    </Card>
  );
}
