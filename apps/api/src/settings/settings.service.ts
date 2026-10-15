import { Global, Inject, Injectable, Logger, Module } from "@nestjs/common";
import { roadEstimate, SETTING_KEYS, SETTINGS, settingsDiff, VEHICLE_SIZE_ORDER, type SettingKey, type SettingValue } from "@nakliye/shared";
import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { AuditService } from "../audit/audit.service.js";
import { DB, type Db } from "../db/db.module.js";
import { settings, users } from "../db/schema.js";

/** Başka bir süreçte (birden çok API süreci) yapılan değişiklik en geç bu sürede görülür; aynı süreçte hemen */
const TTL_MS = 15_000;
const editor = alias(users, "setting_editor");

/**
 * FR-54 parametre yönetimi: teyit aralıkları (BR-01…05), eşleştirme yarıçapı/toleransı/ağırlıkları (BR-20…21) ve
 * koridor fiyat formülü (F7). Kayıt yoksa ya da kayıtlı değer şemaya uymuyorsa (sürüm değişikliği, elle bozulmuş satır)
 * shared varsayılanı kullanılır: zamanlayıcı ve eşleştirme bozuk ayarla çalışmaz. Değişiklik işlem kaydına farkıyla yazılır.
 */
@Injectable()
export class SettingsService {
  private readonly log = new Logger(SettingsService.name);
  private readonly cache = new Map<SettingKey, { value: unknown; at: number }>();

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  async get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value as SettingValue<K>;
    const [row] = await this.db.select({ value: settings.value }).from(settings).where(eq(settings.key, key));
    let value: unknown = SETTINGS[key].defaults;
    if (row) {
      const parsed = SETTINGS[key].schema.safeParse(row.value);
      if (parsed.success) value = parsed.data;
      else this.log.error(`Kayıtlı "${key}" ayarı geçersiz; varsayılan kullanılıyor: ${parsed.error.issues[0]?.message}`);
    }
    this.cache.set(key, { value, at: Date.now() });
    return value as SettingValue<K>;
  }

  confirmation = () => this.get("confirmation");
  matching = () => this.get("matching");
  price = () => this.get("price");

  /** Yönetim paneli: geçerli değer, varsayılan, son değiştiren; fiyat için 500 km örnek aralıkları */
  async adminView() {
    const rows = await this.db
      .select({ key: settings.key, updatedAt: settings.updatedAt, editor: { name: editor.name } })
      .from(settings)
      .leftJoin(editor, eq(editor.id, settings.updatedBy));
    const out = {} as Record<SettingKey, { label: string; value: unknown; defaults: unknown; isDefault: boolean; updatedAt: Date | null; updatedBy: string | null }>;
    for (const key of SETTING_KEYS) {
      const value = await this.get(key);
      const row = rows.find((r) => r.key === key);
      out[key] = {
        label: SETTINGS[key].label,
        value,
        defaults: SETTINGS[key].defaults,
        isDefault: settingsDiff(SETTINGS[key].defaults, value).length === 0,
        updatedAt: row?.updatedAt ?? null,
        updatedBy: row?.editor?.name ?? null,
      };
    }
    const price = await this.price();
    return { settings: out, pricePreview: VEHICLE_SIZE_ORDER.map((vehicleType) => ({ vehicleType, ...roadEstimate(500, vehicleType, price) })).reverse() };
  }

  /** Tam nesne (denetleyicide şemayla doğrulanmış) yazılır; değişmediyse kayıt da yazılmaz */
  async update<K extends SettingKey>(adminId: string, key: K, value: SettingValue<K>, now = new Date()) {
    const before = await this.fresh(key);
    const diff = settingsDiff(before, value);
    if (diff.length === 0) return this.adminView();
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(settings)
        .values({ key, value, updatedBy: adminId, updatedAt: now })
        .onConflictDoUpdate({ target: settings.key, set: { value, updatedBy: adminId, updatedAt: now } })
        .returning({ id: settings.id });
      await this.audit.record({ adminId, action: "ayar_degisikligi", targetType: "setting", targetId: row!.id, subjectUserId: null, note: `${SETTINGS[key].label}: ${diff.join("; ")}` }, tx);
    });
    this.cache.delete(key);
    return this.adminView();
  }

  /** Varsayılana dön: kayıt silinir (sonraki sürümlerde varsayılan değişirse o geçerli olur) */
  async reset(adminId: string, key: SettingKey) {
    const before = await this.fresh(key);
    await this.db.transaction(async (tx) => {
      const [row] = await tx.delete(settings).where(eq(settings.key, key)).returning({ id: settings.id });
      if (row) {
        const diff = settingsDiff(before, SETTINGS[key].defaults);
        await this.audit.record({ adminId, action: "ayar_sifirlama", targetType: "setting", targetId: row.id, subjectUserId: null, note: `${SETTINGS[key].label}${diff.length ? `: ${diff.join("; ")}` : ""}` }, tx);
      }
    });
    this.cache.delete(key);
    return this.adminView();
  }

  /** Önbelleği atlayarak (fark doğru eski değere göre çıksın) */
  private async fresh<K extends SettingKey>(key: K) {
    this.cache.delete(key);
    return this.get(key);
  }
}

@Global()
@Module({ providers: [SettingsService], exports: [SettingsService] })
export class SettingsModule {}
