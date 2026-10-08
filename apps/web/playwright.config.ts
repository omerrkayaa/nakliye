import { defineConfig } from "@playwright/test";

// Uçtan uca web testleri. Ön koşul: API JOBS_ENABLED=false ile çalışıyor ve çıktısı apps/api/api.log'da
// (OTP kodu oradan okunur), web `npm run build && npm run start` ile 3001'de. Tarayıcı: sistemdeki Chrome.
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  timeout: 60_000,
  use: { baseURL: "http://localhost:3001", channel: "chrome", locale: "tr-TR", timezoneId: "Europe/Istanbul" },
  reporter: [["list"]],
});
