import type { MetadataRoute } from "next";
import { GUIDES } from "@/lib/guides";
import { ROUTE_PAGES } from "@/lib/route-pages";
import { SITE_URL } from "@/lib/site";

/** Arama motoruna açık sayfalar: tanıtım, fiyat hesaplayıcı, W2 güzergâh sayfaları, rehber yazıları, hakkımızda, yasal metinler. Panel, paylaşım ve teyit sayfaları yok. */
export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/fiyat", ...ROUTE_PAGES.map((r) => r.path), "/rehber", ...GUIDES.map((g) => `/rehber/${g.slug}`), "/hakkimizda", "/kvkk", "/kullanim-sartlari", "/iletisim"].map((path) => ({ url: SITE_URL + path }));
}
