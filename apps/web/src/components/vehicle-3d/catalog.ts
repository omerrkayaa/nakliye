// Araç tanıma kuralları (three.js'siz): açıklama ve seçim bileşenleri bunu kullanır, 3B modeller (models.ts) ayrı parçada kalır.
import { BODY_TYPES, TYPICAL_BODY, type BodyType, type VehicleType } from "@nakliye/shared";

/** Görüntüleyici açılınca seçili kasa yoksa gösterilen, o araçta en sık görülen kasa */
export const DEFAULT_BODY = TYPICAL_BODY;

/** Bu araçta yaygın olmayan kasalar (yalnız görsel not; eşleştirme kurallarını etkilemez) */
const UNCOMMON: Partial<Record<VehicleType, BodyType[]>> = {
  panelvan: (Object.keys(BODY_TYPES) as BodyType[]).filter((b) => b !== "kapali" && b !== "frigo"),
  kamyonet: ["lowbed", "kayar_perde"],
  kamyon: ["lowbed"],
  kirkayak: ["lowbed"],
};
export const isUncommon = (v: VehicleType, b: BodyType) => UNCOMMON[v]?.includes(b) ?? false;
