import { ACCOUNT_DELETION, trDay } from "@nakliye/shared";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useEffect, useState } from "react";
import { Platform, ScrollView, Text } from "react-native";
import { Button, Card, ErrorText, Field, Muted, s } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { confirm } from "@/lib/confirm";
import { phoneText } from "@/lib/format";
import { C } from "@/lib/theme";

/** FR-07 (KVKK md. 11): verilerimi indir ve hesabımı sil; FR-08 hesabımı dondur. Kurallar web panelindeki Hesap sayfasıyla aynı. */
export default function Hesap() {
  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }} keyboardShouldPersistTaps="handled">
      <Export />
      <Freeze />
      <Delete />
    </ScrollView>
  );
}

const EXPORT_PREFIX = "nakliye-verilerim-";

/**
 * Önceki dökümlerden önbellekte kalan dosyaları siler. Paylaşımın hemen ardından silinmez: shareAsync'in hedef
 * uygulama dosyayı okuyunca mı döndüğü belgede yazmıyor, erken silmek kaydetmeyi bozabilir.
 */
function removeOldExports() {
  if (Platform.OS === "web") return;
  try {
    for (const f of Paths.cache.list()) if (f instanceof File && f.name.startsWith(EXPORT_PREFIX)) f.delete();
  } catch {
    // Önbellek okunamazsa döküm yine çalışır; sistem önbelleği zamanla temizler
  }
}

function Export() {
  useEffect(removeOldExports, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const text = JSON.stringify(await api<unknown>("/me/export"), null, 2);
      const name = `${EXPORT_PREFIX}${trDay(new Date())}.json`;
      if (Platform.OS === "web") {
        // Expo web derlemesi (geliştirme ve testler): tarayıcı indirmesi
        const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        // Telefonda dosya önbelleğe yazılır, sistemin paylaşım menüsüyle kaydedilir ya da gönderilir
        removeOldExports();
        const file = new File(Paths.cache, name);
        file.create({ overwrite: true });
        file.write(text);
        await Sharing.shareAsync(file.uri, { mimeType: "application/json", UTI: "public.json", dialogTitle: "Verilerimi kaydet" });
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Dosya hazırlanamadı");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={s.title}>
        Verilerimi indir
      </Text>
      <Muted>
        Profiliniz, araçlarınız, ilanlarınız, teklifleriniz, taşımalarınız, puanlarınız ve bildirimleriniz tek bir JSON dosyasında. Karşı tarafların
        numaraları dosyada yer almaz.
      </Muted>
      {error && <ErrorText>{error}</ErrorText>}
      {done && <Muted>✓ Dosya hazırlandı</Muted>}
      <Button title="Verilerimi indir" icon="download-outline" variant="outline" busy={busy} onPress={run} />
    </Card>
  );
}

/** FR-08: kod istenmez (geri alınabilir); onaydan sonra oturum kapanır, giriş ekranı notla açılır. */
function Freeze() {
  const { endSession } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function freeze() {
    if (!(await confirm("Hesabınız dondurulsun mu?", "İlanlarınız kapanır, bildirim almazsınız. Yeniden giriş yaptığınızda hesabınız açılır.", "Dondur"))) return;
    setBusy(true);
    setError(null);
    try {
      await api("/me/freeze", { method: "POST" });
      await endSession("Hesabınız donduruldu. Yeniden giriş yaptığınızda açılır.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Hesap dondurulamadı");
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={s.title}>
        Hesabımı dondur
      </Text>
      <Muted>Ara vermek istiyorsanız hesabınızı silmek yerine dondurabilirsiniz; verileriniz silinmez.</Muted>
      <Muted>• Yayındaki ilanlarınız ve boş araç ilanlarınız kapanır; bekleyen teklifleriniz geri çekilir.</Muted>
      <Muted>• Bildirim, rota alarmı ve eşleşme almazsınız; puanlarınız ve geçmişiniz kalır.</Muted>
      <Muted>• SMS koduyla yeniden giriş yaptığınızda hesabınız hemen açılır. Süren bir taşımanız varken dondurulamaz.</Muted>
      {error && <ErrorText>{error}</ErrorText>}
      <Button title="Hesabımı dondur" icon="snow-outline" variant="outline" busy={busy} onPress={freeze} />
    </Card>
  );
}

function Delete() {
  const { me, endSession } = useAuth();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!me) return null;

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      await api("/me/deletion-code", { method: "POST" });
      setSent(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Kod gönderilemedi");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!/^\d{6}$/.test(code)) return setError("SMS ile gelen 6 haneli kodu girin");
    if (!(await confirm("Hesabınız silinsin mi?", "Bu işlem geri alınamaz.", "Hesabımı sil"))) return;
    setBusy(true);
    setError(null);
    try {
      await api("/me", { method: "DELETE", body: { code } });
      removeOldExports();
      await endSession(
        `Hesabınız silindi; kişisel verileriniz anonimleştirildi. ${ACCOUNT_DELETION.reopenAfterDays} gün sonra, ${ACCOUNT_DELETION.restoreDays}. güne kadar aynı numarayla giriş yaparsanız hesabınız puanları ve geçmişiyle yeniden açılır.`,
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Hesap silinemedi");
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={[s.title, { color: C.danger }]}>
        Hesabımı sil
      </Text>
      <Muted>• Numaranız, adınız, firma bilgileriniz, araç plakalarınız, bildirimleriniz ve rota alarmlarınız silinir.</Muted>
      <Muted>• Yayındaki ilanlarınız ve boş araç ilanlarınız kapanır; bekleyen teklifleriniz geri çekilir.</Muted>
      <Muted>• Tamamlanmış taşımalar ve verdiğiniz puanlar karşı tarafın geçmişi için “Silinmiş kullanıcı” adıyla kalır; notlarınız ve yorumlarınız silinir.</Muted>
      <Muted>
        • Süren bir taşımanız varken hesabınız silinemez. Hesabınızla ilgili sonuçlanmamış bir inceleme varsa silme, inceleme sonuçlanana kadar ve en çok{" "}
        {ACCOUNT_DELETION.reportHoldDays} gün ertelenir.
      </Muted>
      <Text style={s.text}>
        Kişisel bilgileriniz geri getirilemez. Silindikten sonra {ACCOUNT_DELETION.reopenAfterDays} gün aynı numarayla giriş yapılamaz. Silip yeniden
        kaydolarak puanların sıfırlanmasını önlemek için numaranızdan üretilen bir özet {ACCOUNT_DELETION.restoreDays} gün saklanır:{" "}
        {ACCOUNT_DELETION.reopenAfterDays}. günden {ACCOUNT_DELETION.restoreDays}. güne kadar aynı numarayla giriş yaparsanız hesabınız puanlarınız ve iş
        geçmişinizle yeniden açılır. {ACCOUNT_DELETION.restoreDays} günden sonra yeni, boş bir hesap açılır. Yalnız ara vermek istiyorsanız yukarıdan
        hesabınızı dondurun.
      </Text>
      {sent && (
        <>
          <Muted>{phoneText(me.phone)} numarasına 6 haneli kod gönderildi.</Muted>
          <Field
            label="SMS'teki kod"
            placeholder="______"
            keyboardType="number-pad"
            autoComplete="sms-otp"
            textContentType="oneTimeCode"
            maxLength={6}
            value={code}
            onChangeText={setCode}
          />
        </>
      )}
      {error && <ErrorText>{error}</ErrorText>}
      {sent ? (
        <>
          <Button title="Hesabımı kalıcı olarak sil" icon="trash-outline" variant="danger" busy={busy} onPress={remove} />
          <Button title="Kodu yeniden gönder" variant="outline" disabled={busy} onPress={sendCode} />
        </>
      ) : (
        <Button title="Silme kodu gönder" icon="mail-outline" variant="outline" busy={busy} onPress={sendCode} />
      )}
    </Card>
  );
}
