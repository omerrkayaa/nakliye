import { trDay } from "@nakliye/shared";

/** Kullanıcı mesajlarındaki an, Türkiye saatiyle "27.10.2026 18:25" */
export const trDateTime = (d: Date) =>
  `${trDay(d).split("-").reverse().join(".")} ${d.toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" })}`;
