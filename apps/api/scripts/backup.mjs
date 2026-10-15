// NFR-08 günlük veritabanı yedeği ve geri yükleme denemesi.
//
//   npm run db:backup          yedek al: backups/nakliye-<zaman>/ altında db.dump (pg_dump, özel biçim), storage.tar.gz
//                              (belge dosyaları, FR-05) ve manifest.json (tablo satır sayıları, SHA-256, migration);
//                              BACKUP_KEEP_DAYS'ten (14) eski yedekleri siler
//   npm run db:backup:check    en son yedeği geçici veritabanına (nakliye_yedek_deneme) geri yükler; özeti, tablo
//                              sayılarını ve dosya arşivini manifestle karşılaştırır, sonra geçici veritabanını siler
//
// Ortam: BACKUP_DIR (varsayılan: depo kökünde backups/), BACKUP_KEEP_DAYS, DB_CONTAINER (nakliye-db-1), DB_USER/DB_NAME
// (nakliye), FILE_STORAGE_DIR (storage). Veritabanı Docker'da çalışır (infra/docker-compose.yml); yayında aynı komutlar
// pg_dump/pg_restore'u doğrudan çalıştıracak biçimde uyarlanır. Sayılar ancak yedek sırasında yazma yoksa birebir tutar.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BACKUP_DIR = resolve(process.env.BACKUP_DIR ?? join(API_DIR, "..", "..", "backups"));
const KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS ?? 14);
const CONTAINER = process.env.DB_CONTAINER ?? "nakliye-db-1";
const USER = process.env.DB_USER ?? "nakliye";
const DB = process.env.DB_NAME ?? "nakliye";
const SCRATCH = "nakliye_yedek_deneme";
const STORAGE = resolve(API_DIR, process.env.FILE_STORAGE_DIR ?? "storage");
const NAME_RE = /^nakliye-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$/;

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.slice(0, 4).join(" ")} başarısız: ${r.stderr || r.error?.message || r.status}`);
  return r.stdout;
};
const psql = (db, sql) => run("docker", ["exec", CONTAINER, "psql", "-U", USER, "-d", db, "-tAc", sql]).trim();
const sha256File = (file) =>
  new Promise((ok, fail) => {
    const h = createHash("sha256");
    createReadStream(file).on("data", (d) => h.update(d)).on("end", () => ok(h.digest("hex"))).on("error", fail);
  });
/** Komutun standart çıktısını dosyaya akıt (büyük döküm belleğe alınmaz) */
const pipeToFile = (cmd, args, file) =>
  new Promise((ok, fail) => {
    const child = spawn(cmd, args);
    const out = createWriteStream(file);
    let err = "";
    child.stdout.pipe(out);
    child.stderr.on("data", (d) => (err += d));
    child.on("error", fail);
    child.on("close", (code) => out.close(() => (code === 0 ? ok() : fail(new Error(`${cmd} çıkış ${code}: ${err}`)))));
  });
/** Dosyayı komutun standart girdisine akıt */
const pipeFromFile = (cmd, args, file) =>
  new Promise((ok, fail) => {
    const child = spawn(cmd, args);
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    child.on("error", fail);
    child.on("close", (code) => (code === 0 ? ok() : fail(new Error(`${cmd} çıkış ${code}: ${err}`))));
    createReadStream(file).pipe(child.stdin);
  });

/** Tüm public tabloların kesin satır sayısı (n_live_tup tahmindir, kullanılmaz) */
function tableCounts(db) {
  const tables = psql(db, "select tablename from pg_tables where schemaname = 'public' order by 1").split("\n").filter(Boolean);
  if (!tables.length) return {};
  const q = tables.map((t) => `select '${t}', count(*) from "${t}"`).join(" union all ");
  return Object.fromEntries(psql(db, q).split("\n").filter(Boolean).map((l) => { const [t, n] = l.split("|"); return [t, Number(n)]; }));
}
const filesIn = (dir) => (existsSync(dir) ? readdirSync(dir, { recursive: true }).filter((f) => statSync(join(dir, String(f))).isFile()).length : 0);

async function backup() {
  const createdAt = new Date();
  const name = `nakliye-${createdAt.toISOString().slice(0, 19).replace(/:/g, "-")}Z`;
  const dir = join(BACKUP_DIR, name);
  mkdirSync(dir, { recursive: true });
  try {
    await writeBackup(dir, createdAt);
  } catch (e) {
    rmSync(dir, { recursive: true, force: true }); // yarım yedek kalmasın (deneme onu seçmesin)
    throw e;
  }
  prune(createdAt);
}

async function writeBackup(dir, createdAt) {
  const counts = tableCounts(DB);
  const migrations = Number(psql(DB, "select count(*) from drizzle.__drizzle_migrations"));
  await pipeToFile("docker", ["exec", CONTAINER, "pg_dump", "-U", USER, "-d", DB, "-Fc"], join(dir, "db.dump"));
  const storageFiles = filesIn(STORAGE);
  // Arşiv adı göreli, komut yedek klasöründe: GNU tar (Git Bash) "C:..." yolunu uzak sunucu adı sanıyor
  if (storageFiles) run("tar", ["-czf", "storage.tar.gz", "-C", dirname(STORAGE), "storage"], { cwd: dir });
  const manifest = {
    format: "nakliye-yedek/1",
    createdAt: createdAt.toISOString(),
    database: { name: DB, migrations, counts, sha256: await sha256File(join(dir, "db.dump")), bytes: statSync(join(dir, "db.dump")).size },
    storage: storageFiles ? { files: storageFiles, sha256: await sha256File(join(dir, "storage.tar.gz")), bytes: statSync(join(dir, "storage.tar.gz")).size } : null,
  };
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  const rows = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`Yedek: ${dir}\n  veritabanı ${(manifest.database.bytes / 1024 / 1024).toFixed(1)} MB, ${Object.keys(counts).length} tablo, ${rows} satır, ${migrations} migration`);
  console.log(`  belge dosyaları: ${storageFiles} dosya${storageFiles ? `, ${(manifest.storage.bytes / 1024).toFixed(0)} KB` : ""}`);
}

/** Yalnız bu betiğin adlandırdığı klasörler silinir */
function prune(now) {
  for (const n of readdirSync(BACKUP_DIR)) {
    if (!NAME_RE.test(n)) continue;
    const at = new Date(n.slice(8, 18) + "T" + n.slice(19, 27).replace(/-/g, ":") + "Z");
    if (now.getTime() - at.getTime() > KEEP_DAYS * 86400e3) {
      rmSync(join(BACKUP_DIR, n), { recursive: true, force: true });
      console.log(`  ${KEEP_DAYS} günden eski yedek silindi: ${n}`);
    }
  }
}

class RestoreFailed extends Error {}

async function check() {
  // Manifesti olan (tamamlanmış) en yeni yedek
  const latest = existsSync(BACKUP_DIR) ? readdirSync(BACKUP_DIR).filter((n) => NAME_RE.test(n) && existsSync(join(BACKUP_DIR, n, "manifest.json"))).sort().at(-1) : undefined;
  if (!latest) throw new Error(`Yedek bulunamadı: ${BACKUP_DIR}`);
  const dir = join(BACKUP_DIR, latest);
  const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  console.log(`Geri yükleme denemesi: ${latest}`);
  const problems = [];
  if ((await sha256File(join(dir, "db.dump"))) !== m.database.sha256) problems.push("db.dump özeti manifestle uyuşmuyor (dosya bozulmuş)");
  psql(DB, `drop database if exists ${SCRATCH}`);
  psql(DB, `create database ${SCRATCH}`);
  try {
    try {
      await pipeFromFile("docker", ["exec", "-i", CONTAINER, "pg_restore", "-U", USER, "-d", SCRATCH, "--no-owner", "--exit-on-error"], join(dir, "db.dump"));
    } catch (e) {
      problems.push(`pg_restore başarısız: ${String(e.message).split("\n").find((l) => l.includes("error")) ?? e.message}`);
      throw new RestoreFailed();
    }
    const restored = tableCounts(SCRATCH);
    const migrations = Number(psql(SCRATCH, "select count(*) from drizzle.__drizzle_migrations"));
    if (migrations !== m.database.migrations) problems.push(`migration sayısı ${migrations}, yedekte ${m.database.migrations}`);
    let same = 0;
    for (const [t, n] of Object.entries(m.database.counts)) {
      if (restored[t] === n) same++;
      else problems.push(`${t}: geri yüklenen ${restored[t] ?? "yok"}, yedek anında ${n}`);
    }
    console.log(`  ${same}/${Object.keys(m.database.counts).length} tablonun satır sayısı birebir; ${migrations} migration`);
    // Konum verisi (PostGIS) de geri gelmeli: eşleştirme ve rota sorguları buna dayanır
    const geo = psql(SCRATCH, "select count(*) from districts where geom is not null");
    console.log(`  koordinatlı ilçe: ${geo}`);
    if (Number(geo) === 0) problems.push("ilçe koordinatları (PostGIS) geri gelmedi");
  } catch (e) {
    if (!(e instanceof RestoreFailed)) throw e;
  } finally {
    psql(DB, `drop database if exists ${SCRATCH}`);
  }
  if (m.storage) {
    if ((await sha256File(join(dir, "storage.tar.gz"))) !== m.storage.sha256) problems.push("storage.tar.gz özeti uyuşmuyor");
    const entries = run("tar", ["-tzf", "storage.tar.gz"], { cwd: dir }).split("\n").filter((l) => l && !l.endsWith("/")).length;
    console.log(`  belge arşivi: ${entries}/${m.storage.files} dosya`);
    if (entries !== m.storage.files) problems.push(`belge arşivinde ${entries} dosya, yedek anında ${m.storage.files}`);
  }
  if (problems.length) {
    console.log(`SORUN (${problems.length}):\n  - ${problems.join("\n  - ")}\n(Yedek sırasında yazma olduysa sayılar tutmayabilir; boşta yeniden deneyin.)`);
    process.exitCode = 1;
  } else console.log("Tamam: yedek geri yüklenebiliyor ve içerik yedek anıyla aynı.");
}

await (process.argv.includes("--check") ? check() : backup());
