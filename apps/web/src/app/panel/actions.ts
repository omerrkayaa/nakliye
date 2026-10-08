"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { ACCESS_COOKIE, REFRESH_COOKIE, accessCookie } from "@/lib/session";

/** Çıkış: refresh belirteci API'de iptal edilir, çerezler silinir. */
export async function logoutAction() {
  const jar = await cookies();
  const refreshToken = jar.get(REFRESH_COOKIE)?.value;
  if (refreshToken) {
    await api("/auth/logout", { method: "POST", body: { refreshToken }, auth: false }).catch(() => undefined);
  }
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
  redirect("/giris");
}

/** Rol seçimi (FR-02): roller JWT'de taşındığı için API yeni erişim belirteci döner, çerez güncellenir. */
export async function becomeShipperAction() {
  const r = await api<{ accessToken: string }>("/me/roles", { method: "POST", body: { roles: ["shipper"] } });
  (await cookies()).set(accessCookie(r.accessToken));
  refresh();
}
