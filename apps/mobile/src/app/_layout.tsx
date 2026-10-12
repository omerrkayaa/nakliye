import { SplashScreen, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, ErrorText } from "@/components/ui";
import { AuthProvider, useAuth } from "@/lib/auth";
import { C } from "@/lib/theme";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <RootStack />
    </AuthProvider>
  );
}

function RootStack() {
  const { status, me, retry } = useAuth();

  useEffect(() => {
    if (status !== "loading") void SplashScreen.hideAsync();
  }, [status]);

  if (status === "loading") return null;
  if (status === "offline")
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", padding: 24, gap: 16, backgroundColor: C.bg }}>
        <ErrorText>Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.</ErrorText>
        <View>
          <Button title="Tekrar dene" icon="refresh" onPress={retry} />
        </View>
      </SafeAreaView>
    );

  const signedIn = status === "signedIn";
  const hasRole = (me?.roles.length ?? 0) > 0;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: C.primary },
        headerTintColor: C.primaryText,
        contentStyle: { backgroundColor: C.bg },
        headerBackButtonDisplayMode: "minimal",
      }}
    >
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="giris" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !hasRole}>
        <Stack.Screen name="rol" options={{ title: "Hesap türü" }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && hasRole}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="yuk/[id]" options={{ title: "Yük detayı" }} />
        <Stack.Screen name="is/[id]" options={{ title: "İş detayı" }} />
        <Stack.Screen name="arac/yeni" options={{ title: "Araç ekle" }} />
        <Stack.Screen name="bos-arac/yeni" options={{ title: "Boş araç bildir" }} />
        <Stack.Screen name="bos-arac/[id]" options={{ title: "Boş aracım" }} />
        <Stack.Screen name="alarm/index" options={{ title: "Rota alarmları" }} />
        <Stack.Screen name="alarm/yeni" options={{ title: "Yeni rota alarmı" }} />
        <Stack.Screen name="bildirimler" options={{ title: "Bildirimler" }} />
        <Stack.Screen name="ilan/yeni" options={{ title: "İlan ver" }} />
        <Stack.Screen name="ilanim/[id]" options={{ title: "İlanım" }} />
        <Stack.Screen name="hesap" options={{ title: "Hesap ve veriler" }} />
      </Stack.Protected>
    </Stack>
  );
}
