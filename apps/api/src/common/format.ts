import { trDay } from "@nakliye/shared";

/** Kullanıcı mesajlarındaki an, Türkiye saatiyle "27.10.2026 18:25" */
export const trDateTime = (d: Date) =>
  `${trDay(d).split("-").reverse().join(".")} ${d.toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" })}`;

/** Kalan süre, yukarı yuvarlanmış dakikayla: "45 dakika", "3 saat", "3 saat 20 dakika" (erken denenmesin diye yukarı) */
export const trDuration = (ms: number) => {
  const m = Math.max(1, Math.ceil(ms / 60_000));
  const h = Math.floor(m / 60);
  return h ? `${h} saat${m % 60 ? ` ${m % 60} dakika` : ""}` : `${m} dakika`;
};
