import type { MetadataRoute } from "next";
import { ROUTE_PAGES } from "@/lib/route-pages";
import { SITE_URL } from "@/lib/site";

/** Arama motoruna açık sayfalar: tanıtım, W2 güzergâh sayfaları, yasal metinler. Panel, paylaşım ve teyit sayfaları yok. */
export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", ...ROUTE_PAGES.map((r) => r.path), "/kvkk", "/kullanim-sartlari", "/iletisim"].map((path) => ({ url: SITE_URL + path }));
}
