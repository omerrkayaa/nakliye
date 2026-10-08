import { buildTemplate } from "@/lib/bulk";

/** Toplu ilan şablonu (.xlsx). Yan etkisiz GET; panel girişi proxy'de. */
export async function GET() {
  const body = await buildTemplate();
  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="nakliye-toplu-ilan-sablonu.xlsx"',
      "cache-control": "no-store",
    },
  });
}
