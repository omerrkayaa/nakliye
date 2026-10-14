// F4 / A10: Dönüş Planı sekmesi — süren iş (Efeler → Tuzla) için dönüş yükü (Pendik → Nazilli) ve yol üstü ara yük
// (Gebze → Osmangazi); "bu rotada yük çıkınca haber ver" rota alarmı kurar. Expo web derlemesinde (390 px). OSRM açık olmalı.
import { expect, test, type Page } from "@playwright/test";
import { adminToken, api, apiUser, collectErrors, districtId, noHorizontalOverflow, otpFor, phone, psql, shot, vis } from "./helpers";

const trDay = (offset: number) => new Date(Date.now() + 3 * 3600e3 + offset * 86400e3).toISOString().slice(0, 10);

async function uiLogin(page: Page, p: string) {
  await page.goto("/");
  await page.getByLabel("Cep telefonu").locator("visible=true").fill(`0${p.slice(3)}`);
  await vis(page, "SMS kodu gönder").click();
  const codeInput = page.getByLabel("SMS kodu").locator("visible=true");
  await expect(codeInput).toBeVisible(); // yeni kod gönderildi (günlükte API girişinin eski kodu da var)
  await codeInput.fill(await otpFor(p));
  await vis(page, "Giriş yap").click();
  await expect(page.getByRole("tab", { name: /Profil/ })).toBeVisible({ timeout: 20_000 });
}

test("dönüş planı: süren iş için dönüş ve yol üstü yükler; alarm kurulur", async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  const admin = await adminToken(phone(71));
  const me = phone(70);
  const C = await apiUser(me, ["carrier"]);
  const S = await apiUser(phone(72), ["shipper"]);
  const S2 = await apiUser(phone(73), ["shipper"]);
  const [EFELER, TUZLA, PENDIK, NAZILLI, GEBZE, OSMANGAZI] = await Promise.all([
    districtId("Aydın", "Efeler"),
    districtId("İstanbul", "Tuzla"),
    districtId("İstanbul", "Pendik"),
    districtId("Aydın", "Nazilli"),
    districtId("Kocaeli", "Gebze"),
    districtId("Bursa", "Osmangazi"),
  ]);
  const load = async (t: string, from: number, to: number, day: number) => {
    const r = await api<{ id: string; status: string }>("POST", "/loads", t, {
      originDistrictId: from, destDistrictId: to, loadFrom: trDay(day), loadTo: trDay(day), cargoType: "genel",
      weightTon: 8, vehicleType: "kamyon", bodyType: null, priceType: "teklif", price: null,
    });
    if (r.body.status === "moderasyonda") await api("POST", `/admin/loads/${r.body.id}/review`, admin, { decision: "onay" });
    return r.body.id;
  };
  const plate = `09 RM ${me.slice(-6, -2)}`;
  const v = (await api<{ id: string }>("POST", "/vehicles", C, { plate, vehicleType: "kamyon", bodyType: "kapali", capacityTon: 15 })).body.id;
  const jobLoad = await load(S, EFELER, TUZLA, 1);
  const offer = (await api<{ id: string }>("POST", `/loads/${jobLoad}/offers`, C, { vehicleId: v, price: 20000 })).body.id;
  expect((await api("POST", `/offers/${offer}/accept`, S)).status).toBe(201);
  await load(S2, PENDIK, NAZILLI, 3);
  await load(S2, GEBZE, OSMANGAZI, 3);

  psql(`delete from otp_codes where phone='${me}'`); // API girişinin 60 sn yeniden gönderme sınırı
  await uiLogin(page, me);
  await page.getByRole("tab", { name: /Dönüş/ }).click();
  const plan = page.getByLabel("Dönüş planı: Efeler → Tuzla", { exact: true }).locator("visible=true");
  await expect(plan).toBeVisible({ timeout: 20_000 });
  await expect(plan).toContainText("Süren iş: Efeler → Tuzla");
  await expect(plan).toContainText("Tahmini varış:");
  await expect(plan).toContainText("Dönüş: Tuzla → Efeler");
  await expect(plan.getByRole("button", { name: "Pendik, İstanbul → Nazilli, Aydın yükü" }).first()).toBeVisible();
  await expect(plan.getByRole("button", { name: "Gebze, Kocaeli → Osmangazi, Bursa yükü" }).first()).toBeVisible();
  await expect(plan).toContainText(/Yolunuzdan en çok \d+ km sapma/);
  await expect(vis(page, "Boş araçlarım")).toBeVisible();
  expect(await noHorizontalOverflow(page)).toBe(true);
  await shot(page, "donus-plani");

  await plan.getByRole("button", { name: "Bu rotada yük çıkınca haber ver" }).click();
  await expect(plan).toContainText("Bu dönüş için rota alarmınız var", { timeout: 20_000 });
  expect(psql(`select count(*) from route_alerts a join users u on u.id = a.user_id where u.phone='${me}' and a.origin_district_id=${TUZLA} and a.dest_district_id=${EFELER} and a.vehicle_type='kamyon'`)).toBe("1");
  expect(errors).toEqual([]);
});
