import { Alert, Platform } from "react-native";

/** Geri alınamaz işlemden önce onay sor (Android: yerel diyalog; web derlemesi: tarayıcı onayı). */
export function confirm(title: string, message: string, ok = "Evet"): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: "Vazgeç", style: "cancel", onPress: () => resolve(false) },
      { text: ok, style: "destructive", onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );
}

/** Bilgi notu (Android: yerel diyalog; web derlemesi: tarayıcı uyarısı). */
export function inform(title: string, message: string) {
  if (Platform.OS === "web") window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}
