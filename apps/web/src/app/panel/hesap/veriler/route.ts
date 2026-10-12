import { trDay } from "@nakliye/shared";
import { api } from "@/lib/api";

/** FR-07: kişisel veri dökümü dosya olarak indirilir (API `GET /me/export`; belirteç httpOnly çerezden). */
export async function GET() {
  const data = await api<unknown>("/me/export");
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="nakliye-verilerim-${trDay(new Date())}.json"`,
      "cache-control": "no-store",
    },
  });
}
