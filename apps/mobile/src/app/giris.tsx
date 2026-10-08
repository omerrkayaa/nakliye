import { phoneSchema } from "@nakliye/shared";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, ErrorText, Field, Muted, s } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { C } from "@/lib/theme";
import type { Tokens } from "@/lib/types";

// Demo hesabı: apps/api/.env'deki DEMO_PHONE / DEMO_OTP ile aynı olmalı (yalnız geliştirme derlemesinde görünür).
const DEMO = { phone: "0555 010 20 30", code: "123456" };

/** A2 — Telefonla giriş: numara → SMS kodu */
export default function Giris() {
  const { signIn } = useAuth();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode(p = phone) {
    const parsed = phoneSchema.safeParse(p);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Geçerli bir numara girin");
    setBusy(true);
    setError(null);
    try {
      await api("/auth/otp/request", { method: "POST", body: { phone: parsed.data }, auth: false });
      setStep("code");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Bir sorun oluştu");
    } finally {
      setBusy(false);
    }
  }

  async function verify(p = phone, c = code) {
    if (!/^\d{6}$/.test(c)) return setError("SMS ile gelen 6 haneli kodu girin");
    setBusy(true);
    setError(null);
    try {
      const t = await api<Tokens>("/auth/otp/verify", { method: "POST", body: { phone: p, code: c }, auth: false });
      await signIn(t);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Bir sorun oluştu");
      setBusy(false);
    }
  }

  async function demo() {
    setPhone(DEMO.phone);
    setCode(DEMO.code);
    setBusy(true);
    setError(null);
    // Kod her zaman aynı; 60 sn içinde ikinci istek 429 alır ama önceki kod hâlâ geçerli
    await api("/auth/otp/request", { method: "POST", body: { phone: phoneSchema.parse(DEMO.phone) }, auth: false }).catch(() => {});
    await verify(phoneSchema.parse(DEMO.phone), DEMO.code);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.primary }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 20, gap: 24 }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 6 }}>
            <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: "800", color: C.primaryText }}>
              Nakliye
            </Text>
            <Text style={{ fontSize: 18, color: "#D5DEEA" }}>Gördüğün her yük gerçek ve şu an geçerli.</Text>
          </View>

          <View style={[s.card, { gap: 16 }]}>
            {step === "phone" ? (
              <>
                <Field
                  label="Cep telefonu"
                  placeholder="05XX XXX XX XX"
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  value={phone}
                  onChangeText={setPhone}
                  onSubmitEditing={() => requestCode()}
                />
                {error && <ErrorText>{error}</ErrorText>}
                <Button title="SMS kodu gönder" onPress={() => requestCode()} busy={busy} />
              </>
            ) : (
              <>
                <Muted>{phone} numarasına gelen 6 haneli kodu girin.</Muted>
                <Field
                  label="SMS kodu"
                  placeholder="______"
                  keyboardType="number-pad"
                  autoComplete="sms-otp"
                  textContentType="oneTimeCode"
                  maxLength={6}
                  value={code}
                  onChangeText={setCode}
                  onSubmitEditing={() => verify(phone, code)}
                  style={{ letterSpacing: 6, fontSize: 22 }}
                />
                {error && <ErrorText>{error}</ErrorText>}
                <Button title="Giriş yap" onPress={() => verify(phoneSchema.parse(phone), code)} busy={busy} />
                <Button
                  title="Numarayı değiştir"
                  variant="outline"
                  onPress={() => {
                    setStep("phone");
                    setCode("");
                    setError(null);
                  }}
                />
              </>
            )}
          </View>

          {__DEV__ && (
            <View style={{ gap: 8 }}>
              <Button title="Demo hesabıyla gir" variant="accent" icon="flash" onPress={demo} busy={busy} />
              <Text style={{ color: "#D5DEEA", textAlign: "center" }}>
                Demo: {DEMO.phone} · kod {DEMO.code} (yalnız geliştirme)
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
