import { loadShareText, sharePath, type ShareableLoad } from "@nakliye/shared";
import { Alert, Platform, Share } from "react-native";
import { devHost } from "./api";

/** Paylaşım bağlantısının web adresi: EXPO_PUBLIC_WEB_URL ya da geliştirmede bilgisayarın adresi (web 3001'de) */
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? `http://${devHost ?? "localhost"}:3001`).replace(/\/$/, "");

/** F8: sistemin paylaşım menüsü (WhatsApp dahil). Metin web paneliyle aynı (shared loadShareText). */
export async function shareLoad(l: ShareableLoad & { shareId: string }) {
  const message = loadShareText(l, WEB_URL + sharePath(l.shareId));
  try {
    await Share.share({ message });
  } catch {
    // Web derlemesinde tarayıcı paylaşımı desteklemiyorsa (yalnız geliştirme): metni kopyala
    if (Platform.OS === "web") {
      await navigator.clipboard?.writeText(message).catch(() => undefined);
      window.alert("Paylaşım metni panoya kopyalandı");
    } else Alert.alert("Paylaşılamadı", "Tekrar deneyin.");
  }
}
