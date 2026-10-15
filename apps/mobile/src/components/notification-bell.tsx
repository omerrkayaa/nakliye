import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { C, TOUCH } from "@/lib/theme";
import { useApi } from "@/lib/use-api";

/** Sekme başlığındaki zil: okunmamış bildirim sayısı (ekran odaklandıkça tazelenir; push gelene kadar tek kaynak bu) */
export function NotificationBell() {
  const { data } = useApi<{ unread: number }>("/notifications");
  const unread = data?.unread ?? 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `Bildirimler, ${unread} okunmamış` : "Bildirimler"}
      onPress={() => router.push("/bildirimler")}
      style={{ width: TOUCH, height: TOUCH, alignItems: "center", justifyContent: "center", marginRight: 4 }}
    >
      <Ionicons name={unread > 0 ? "notifications" : "notifications-outline"} size={24} color={C.primaryText} />
      {unread > 0 && (
        <View
          style={{ position: "absolute", top: 6, right: 4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.accent, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}
        >
          <Text style={{ color: C.accentOn, fontSize: 11, fontWeight: "700" }}>{unread > 99 ? "99+" : unread}</Text>
        </View>
      )}
    </Pressable>
  );
}
