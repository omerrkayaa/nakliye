import { CARGO_TYPES, VEHICLE_TYPES } from "@nakliye/shared";
import { api, ApiError } from "@/lib/api";
import { dayRange, place, tl } from "@/lib/format";
import { OG_SIZE, ogCard } from "@/lib/og";
import type { SharedLoad } from "@/lib/types";

export const alt = "Yük ilanı: güzergâh, yükleme tarihi, yük ve araç";
export const size = OG_SIZE;
export const contentType = "image/png";

/** FR-16 / F8 paylaşım kartının görseli (WhatsApp/Telegram önizlemesi). Sayfadaki gibi numara yok. */
export default async function Image({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  let l: SharedLoad | null = null;
  try {
    l = await api<SharedLoad>(`/public/loads/${encodeURIComponent(shareId)}`, { auth: false });
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 404)) throw e;
  }
  if (!l) return ogCard({ title: ["Yük ilanı bulunamadı"] });
  const title = [place(l.origin), `→ ${place(l.dest)}`];
  if (!("loadFrom" in l) || (l.status !== "teyitli" && l.status !== "teyit_bekliyor")) return ogCard({ title, chips: ["Bu ilan artık yayında değil"] });
  return ogCard({
    title,
    chips: [
      `${dayRange(l.loadFrom, l.loadTo)} yükleme`,
      `${l.weightTon} ton ${CARGO_TYPES[l.cargoType]}`,
      VEHICLE_TYPES[l.vehicleType],
      l.priceType === "sabit" && l.price !== null ? tl(l.price) : "Teklif usulü",
    ],
  });
}
