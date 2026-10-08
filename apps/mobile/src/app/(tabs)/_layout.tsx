import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import { C } from "@/lib/theme";

// docs/02 §4 alt sekmeler: Yükler · Dönüş Planı · İlan Ver · İşlerim · Profil — bu dilimde Yükler, İşlerim, Profil.
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: C.primary },
        headerTintColor: C.primaryText,
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.muted,
        sceneStyle: { backgroundColor: C.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Yükler", tabBarIcon: ({ color, size }) => <Ionicons name="cube-outline" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="isler"
        options={{ title: "İşlerim", tabBarIcon: ({ color, size }) => <Ionicons name="briefcase-outline" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="profil"
        options={{ title: "Profil", tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={color} size={size} /> }}
      />
    </Tabs>
  );
}
