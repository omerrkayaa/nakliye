import { describe, expect, it } from "vitest";
import {
  applyConfirmationAnswer,
  evaluateLoadStatus,
  nextReminderAt,
  shouldForceReconfirm,
  shouldSendSmsFallback,
  type ConfirmableLoad,
} from "../src/rules/confirmation.js";

const t = (s: string) => new Date(s);
const base: ConfirmableLoad = {
  status: "teyitli",
  lastConfirmedAt: t("2026-10-07T09:00:00Z"),
  reminderSentAt: null,
  loadFromStart: t("2026-10-10T00:00:00Z"),
  loadToEnd: t("2026-10-11T23:59:59Z"),
};

describe("nextReminderAt (BR-02)", () => {
  it("normal günlerde 24 saat sonra sorar", () => {
    expect(nextReminderAt(t("2026-10-07T09:00:00Z"), base.loadFromStart)).toEqual(t("2026-10-08T09:00:00Z"));
  });

  it("yükleme gününde 6 saatte bir sorar", () => {
    expect(nextReminderAt(t("2026-10-10T08:00:00Z"), base.loadFromStart)).toEqual(t("2026-10-10T14:00:00Z"));
  });

  it("24 saat yükleme gününe sarkıyorsa yükleme günü sabahı sorar", () => {
    expect(nextReminderAt(t("2026-10-09T20:00:00Z"), base.loadFromStart)).toEqual(t("2026-10-10T06:00:00Z"));
  });
});

describe("evaluateLoadStatus (BR-03, BR-04)", () => {
  it("hatırlatma yoksa durum değişmez", () => {
    expect(evaluateLoadStatus(base, t("2026-10-08T12:00:00Z"))).toBe("teyitli");
  });

  it("4 saat içinde cevap yoksa 'teyit_bekliyor' olur", () => {
    const load = { ...base, reminderSentAt: t("2026-10-08T09:00:00Z") };
    expect(evaluateLoadStatus(load, t("2026-10-08T12:59:00Z"))).toBe("teyitli");
    expect(evaluateLoadStatus(load, t("2026-10-08T13:00:00Z"))).toBe("teyit_bekliyor");
  });

  it("4 + 12 saat sonra 'suresi_doldu' olur", () => {
    const load = { ...base, status: "teyit_bekliyor" as const, reminderSentAt: t("2026-10-08T09:00:00Z") };
    expect(evaluateLoadStatus(load, t("2026-10-09T01:00:00Z"))).toBe("suresi_doldu");
  });

  it("yükleme tarih aralığı bittiyse 'suresi_doldu' olur", () => {
    expect(evaluateLoadStatus(base, t("2026-10-12T00:00:01Z"))).toBe("suresi_doldu");
  });

  it("kapanmış ya da iptal ilan değişmez", () => {
    expect(evaluateLoadStatus({ ...base, status: "kapandi" }, t("2027-01-01T00:00:00Z"))).toBe("kapandi");
    expect(evaluateLoadStatus({ ...base, status: "iptal" }, t("2027-01-01T00:00:00Z"))).toBe("iptal");
  });
});

describe("teyit cevapları ve tetikleyiciler", () => {
  it("cevapları duruma çevirir", () => {
    expect(applyConfirmationAnswer("gecerli")).toBe("teyitli");
    expect(applyConfirmationAnswer("arac_bulundu")).toBe("kapandi");
    expect(applyConfirmationAnswer("iptal")).toBe("iptal");
  });

  it("push açılmazsa 30 dk sonra SMS gönderir", () => {
    const sent = t("2026-10-08T09:00:00Z");
    expect(shouldSendSmsFallback(sent, false, t("2026-10-08T09:29:00Z"))).toBe(false);
    expect(shouldSendSmsFallback(sent, false, t("2026-10-08T09:30:00Z"))).toBe(true);
    expect(shouldSendSmsFallback(sent, true, t("2026-10-08T10:00:00Z"))).toBe(false);
  });

  it("2 farklı doğrulanmış şikayetçide anında teyit ister (BR-05)", () => {
    expect(shouldForceReconfirm(1)).toBe(false);
    expect(shouldForceReconfirm(2)).toBe(true);
  });
});
