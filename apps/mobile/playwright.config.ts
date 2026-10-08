import { defineConfig } from "@playwright/test";

// Mobil uygulamanın uçtan uca testleri, Expo web derlemesinde (ürün Android; cihaza özgü davranış burada sınanmaz).
// Ön koşul: API JOBS_ENABLED=false ile çalışıyor ve çıktısı apps/api/api.log'da (OTP kodu oradan okunur);
// `npx expo start --web --port 8081` açık (kod değişince yeniden başlatın: CI=1 iken dosya izlenmez).
// API CORS açmadığı için yalnız test tarayıcısında web güvenliği kapalı. Tarayıcı: sistemdeki Chrome.
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:8081",
    channel: "chrome",
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    viewport: { width: 390, height: 844 },
    actionTimeout: 15_000,
    launchOptions: { args: ["--disable-web-security"] },
  },
  reporter: [["list"]],
});
