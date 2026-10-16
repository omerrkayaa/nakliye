import { defineConfig } from "@playwright/test";

// Uçtan uca web testleri. Ön koşul: API JOBS_ENABLED=false ile çalışıyor ve çıktısı apps/api/api.log'da
// (OTP kodu oradan okunur), web `npm run build && npm run start` ile 3001'de.
// NFR-03 tarayıcı uyumu: aynı takım sistemdeki Chrome ve Edge ile Playwright'ın Firefox motorunda koşar (bir kez
// `npx playwright install firefox`). `npm run test:e2e` yalnız Chrome; `npm run test:e2e:tarayicilar` üçü birden.
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  timeout: 60_000,
  use: { baseURL: "http://localhost:3001", locale: "tr-TR", timezoneId: "Europe/Istanbul" },
  projects: [
    { name: "chrome", use: { channel: "chrome" } },
    { name: "edge", use: { channel: "msedge" } },
    { name: "firefox", use: { browserName: "firefox" } },
  ],
  reporter: [["list"]],
});
