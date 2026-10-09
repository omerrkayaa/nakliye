import { REPORT_REASONS, type ReportReason } from "@nakliye/shared";
import { useState } from "react";
import { Text } from "react-native";
import { Choice } from "@/components/choice";
import { Badge, Button, Card, ErrorText, Field, Muted, s } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

/**
 * İlan şikayeti (FR-51, BR-05): önce kapalı, dokununca sebep + isteğe bağlı not. "Yük yok" diyen birden çok sayılan
 * nakliyeci (doğrulanmış ya da ilanı aramış) ilanı hemen yeniden teyide düşürür; diğer sebepler yönetici kuyruğuna gider.
 */
export function ReportForm({ loadId }: { loadId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (sent)
    return (
      <Card>
        <Badge tone="ok" icon="checkmark-circle" label="Şikayetiniz alındı" />
        <Muted>Yönetici inceleyecek. Haklı bulunan şikayetler ilan sahibinin güven skorunu düşürür.</Muted>
      </Card>
    );
  if (!open) return <Button title="Bu ilanı şikayet et" icon="flag-outline" variant="danger" onPress={() => setOpen(true)} />;

  async function submit() {
    if (!reason) return setError("Şikayet sebebini seçin");
    setBusy(true);
    setError(null);
    try {
      await api("/reports", { method: "POST", body: { targetType: "load_post", targetId: loadId, reason, note: note.trim() || undefined } });
      setSent(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Şikayet gönderilemedi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 14 }}>
      <Text accessibilityRole="header" style={s.title}>
        İlanı şikayet et
      </Text>
      <Choice label="Sebep" options={REPORT_REASONS} value={reason} onChange={setReason} />
      <Field
        label="Açıklama (isteğe bağlı)"
        value={note}
        onChangeText={setNote}
        maxLength={500}
        multiline
        placeholder="ör. Aradım, yükün dün gittiğini söyledi"
        style={{ minHeight: 72, textAlignVertical: "top", paddingTop: 12 }}
      />
      {error && <ErrorText>{error}</ErrorText>}
      <Button title="Şikayeti gönder" variant="danger" icon="flag" busy={busy} onPress={submit} />
      <Button title="Vazgeç" variant="outline" onPress={() => setOpen(false)} />
    </Card>
  );
}
