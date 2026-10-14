import { DOCUMENT_LIMITS, DOCUMENT_TYPES, trDay, type DocumentType } from "@nakliye/shared";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { Badge, Button, Card, ErrorText, Muted, Status, s } from "@/components/ui";
import { api, API_URL, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { MyDocument, Vehicle } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const MB = DOCUMENT_LIMITS.maxBytes / 1024 / 1024;
const day = (d: string) => d.split("-").reverse().join(".");

/** Seçilen dosya: telefonda uri, web derlemesinde File nesnesi */
interface Picked {
  uri: string;
  name: string;
  mimeType?: string | null;
  size?: number | null;
  file?: File;
}

/**
 * A15 Belgelerim (FR-05, BR-10): nakliyecide araç başına ruhsat ve sigorta, kişiye K belgesi ve SRC; yük sahibinde vergi
 * levhası. Dosya fotoğrafla ya da dosya seçerek (PDF/JPEG/PNG, ≤ 10 MB) yüklenir, yönetici onaylar. Görüntüleme 5 dk'lık
 * imzalı bağlantıyla uygulama içi tarayıcıda.
 */
export default function Belgeler() {
  const { me, refreshMe } = useAuth();
  const isCarrier = me?.roles.includes("carrier") ?? false;
  const isShipper = me?.roles.includes("shipper") ?? false;
  const docs = useApi<{ items: MyDocument[] }>("/documents");
  const vehicles = useApi<Vehicle[]>(isCarrier ? "/vehicles" : null);
  // Yönetici onayı başka yerde olur: ekran her açıldığında rozet (me) de tazelenir. refreshMe her yenilemede yeni
  // referans aldığı için ref'ten çağrılır (bağımlılık olsa odak etkisi kendini tekrar tetiklerdi).
  const refreshRef = useRef(refreshMe);
  useEffect(() => {
    refreshRef.current = refreshMe;
  }, [refreshMe]);
  useFocusEffect(
    useCallback(() => {
      refreshRef.current().catch(() => {});
    }, []),
  );
  if (!me) return null;

  // Liste yeniden eskiye: türün (ve aracın) en yeni kaydı geçerli olan
  const latest = (type: DocumentType, vehicleId: string | null) => docs.data?.items.find((d) => d.type === type && d.vehicleId === vehicleId) ?? null;
  const done = async () => {
    await docs.reload();
    await refreshMe();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
      <Card style={{ gap: 6 }}>
        <Text accessibilityRole="header" style={s.title}>
          Doğrulama
        </Text>
        {me.verified ? <Badge tone="ok" icon="shield-checkmark" label="Doğrulanmış" /> : <Badge tone="idle" icon="shield-outline" label="Henüz doğrulanmadı" />}
        {isCarrier && <Muted>Nakliyecide ✅ rozeti için bir aracınızın ruhsatı onaylanmalı; K yetki belgesi ve SRC ile bir üst seviyeye çıkarsınız.</Muted>}
        {isShipper && <Muted>Yük sahibinde rozet için vergi levhanız onaylanmalı.</Muted>}
        <Muted>PDF, JPEG ya da PNG; en çok {MB} MB. Belgeleri yalnız siz ve yöneticiler görebilir.</Muted>
      </Card>

      <Status loading={docs.loading && !docs.data} error={docs.error} onRetry={docs.reload} />

      {docs.data && isCarrier && (
        <>
          {vehicles.data?.length === 0 && (
            <Card style={{ gap: 8 }}>
              <Muted>Ruhsat ve sigorta araca bağlıdır; önce aracınızı ekleyin.</Muted>
              <Button title="Araç ekle" icon="add" variant="outline" onPress={() => router.push("/arac/yeni")} />
            </Card>
          )}
          {vehicles.data?.map((v) => (
            <Card key={v.id} style={{ gap: 10 }}>
              <Text accessibilityRole="header" style={[s.text, { fontWeight: "700" }]}>
                {v.plate}
              </Text>
              <DocRow type="ruhsat" vehicleId={v.id} doc={latest("ruhsat", v.id)} onDone={done} />
              <DocRow type="sigorta" vehicleId={v.id} doc={latest("sigorta", v.id)} onDone={done} />
            </Card>
          ))}
          <Card style={{ gap: 10 }}>
            <Text accessibilityRole="header" style={[s.text, { fontWeight: "700" }]}>
              Kişisel belgeler
            </Text>
            <DocRow type="k_belgesi" vehicleId={null} doc={latest("k_belgesi", null)} onDone={done} />
            <DocRow type="src" vehicleId={null} doc={latest("src", null)} onDone={done} />
          </Card>
        </>
      )}
      {docs.data && isShipper && (
        <Card style={{ gap: 10 }}>
          {me.company ? (
            <DocRow type="vergi_levhasi" vehicleId={null} doc={latest("vergi_levhasi", null)} onDone={done} />
          ) : (
            <Muted>Vergi levhası için önce Profil’den firma unvanınızı kaydedin.</Muted>
          )}
        </Card>
      )}
    </ScrollView>
  );
}

function DocRow({ type, vehicleId, doc, onDone }: { type: DocumentType; vehicleId: string | null; doc: MyDocument | null; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(p: Picked) {
    if (p.size && p.size > DOCUMENT_LIMITS.maxBytes) return setError(`Dosya en çok ${MB} MB olabilir`);
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("type", type);
      if (vehicleId) body.append("vehicleId", vehicleId);
      // React Native çok parçalı formda dosyayı {uri, name, type} olarak alır; web derlemesinde gerçek File
      if (p.file) body.append("file", p.file, p.name);
      else body.append("file", { uri: p.uri, name: p.name, type: p.mimeType ?? "application/octet-stream" } as unknown as Blob);
      await api("/documents", { method: "POST", body });
      await onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Belge yüklenemedi");
    } finally {
      setBusy(false);
    }
  }

  async function camera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setError("Kamera izni verilmedi; ayarlardan izin verin ya da dosya seçin");
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
    const a = r.canceled ? null : r.assets[0];
    if (a) await upload({ uri: a.uri, name: a.fileName ?? `${type}.jpg`, mimeType: a.mimeType ?? "image/jpeg", size: a.fileSize, file: a.file });
  }

  async function pick() {
    const r = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/jpeg", "image/png"], copyToCacheDirectory: true });
    const a = r.canceled ? null : r.assets[0];
    if (a) await upload({ uri: a.uri, name: a.name, mimeType: a.mimeType, size: a.size, file: a.file });
  }

  async function view() {
    setError(null);
    try {
      const { path } = await api<{ path: string }>(`/documents/${doc!.id}/url`);
      if (Platform.OS === "web") window.open(API_URL + path, "_blank", "noopener");
      else await WebBrowser.openBrowserAsync(API_URL + path);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Belge açılamadı");
    }
  }

  const expired = doc?.status === "onay" && doc.expiresAt !== null && doc.expiresAt < trDay(new Date());
  return (
    <View accessibilityLabel={DOCUMENT_TYPES[type]} style={{ gap: 6 }}>
      <Text style={s.text}>{DOCUMENT_TYPES[type]}</Text>
      {!doc ? (
        <Badge tone="idle" icon="cloud-upload-outline" label="Yüklenmedi" />
      ) : doc.status === "bekliyor" ? (
        <Badge tone="warn" icon="time-outline" label="İnceleniyor" />
      ) : doc.status === "ret" ? (
        <Badge tone="warn" icon="close-circle-outline" label="Reddedildi" />
      ) : expired ? (
        <Badge tone="warn" icon="alert-circle-outline" label="Süresi doldu" />
      ) : (
        <Badge tone="ok" icon="checkmark-circle" label={doc.expiresAt ? `Onaylı · ${day(doc.expiresAt)} tarihine kadar` : "Onaylı"} />
      )}
      {doc?.status === "ret" && <Muted>Ret sebebi: {doc.rejectReason}. Düzeltip yeniden yükleyin.</Muted>}
      {error && <ErrorText>{error}</ErrorText>}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {Platform.OS !== "web" && <Button title="Fotoğraf çek" icon="camera-outline" variant="outline" busy={busy} onPress={camera} />}
        <Button title={doc ? "Yeniden yükle" : "Dosya seç"} icon="document-attach-outline" variant="outline" busy={busy} onPress={pick} />
        {doc && <Button title="Görüntüle" icon="eye-outline" variant="outline" onPress={view} />}
      </View>
    </View>
  );
}
