import type { Role } from "@nakliye/shared";
import { useState } from "react";
import { ScrollView, Text } from "react-native";
import { Button, Card, Chip, ErrorText, Muted, s } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/** A3 — Rol seçimi: nakliyeci ve/veya yük sahibi */
export default function Rol() {
  const { addRoles } = useAuth();
  const [roles, setRoles] = useState<Role[]>(["carrier"]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (r: Role) => setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await addRoles(roles);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Bir sorun oluştu");
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Card>
        <Text accessibilityRole="header" style={s.title}>
          Uygulamayı nasıl kullanacaksınız?
        </Text>
        <Muted>İkisini birden seçebilirsiniz.</Muted>
        <Chip label="Nakliyeciyim (aracım var)" selected={roles.includes("carrier")} onPress={() => toggle("carrier")} />
        <Chip label="Yük sahibiyim (yük veriyorum)" selected={roles.includes("shipper")} onPress={() => toggle("shipper")} />
      </Card>
      {error && <ErrorText>{error}</ErrorText>}
      <Button title="Devam" onPress={save} busy={busy} disabled={roles.length === 0} />
    </ScrollView>
  );
}
