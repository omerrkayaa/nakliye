// Tüm uçtan uca test takımlarını sırayla çalıştırır ve özetler.
// Ön koşul: API JOBS_ENABLED=false ile çalışıyor, çıktısı <log> dosyasında (bkz. e2e-confirmation.mjs).
// Kullanım (apps/api içinden): npm run test:e2e   (log varsayılanı: api.log)
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const log = process.argv[2] ?? "api.log";
const suites = ["loads", "confirmation", "reports", "vehicles", "matching", "jobs", "ratings", "alerts", "admin", "disputes", "metrics", "carriers", "share", "bulk", "routes", "account", "documents", "return-plan", "security", "mfa", "audit", "settings", "public-carriers"];
let failed = 0;
for (const s of suites) {
  const file = fileURLToPath(new URL(`./e2e-${s}.mjs`, import.meta.url));
  const r = spawnSync(process.execPath, [file, log], { encoding: "utf8" });
  const summary = (r.stdout.match(/Sonuç: .*/) ?? ["Sonuç yok (çöktü)"])[0];
  const failures = r.stdout.split("\n").filter((l) => l.includes("✗"));
  console.log(`${r.status === 0 ? "✓" : "✗"} ${s.padEnd(13)} ${summary}`);
  for (const f of failures) console.log(`    ${f.trim()}`);
  if (r.status !== 0) {
    failed++;
    if (r.stderr) console.log(r.stderr.split("\n").slice(0, 5).join("\n"));
  }
}
process.exitCode = failed ? 1 : 0;
