import { notFound } from "next/navigation";
import { OG_SIZE, ogCard } from "@/lib/og";
import { ROUTE_PAGES, routePage } from "@/lib/route-pages";

export const alt = "Güzergâha göre nakliye: tahmini ücret aralığı, mesafe ve yayındaki ilanlar";
export const size = OG_SIZE;
export const contentType = "image/png";

export function generateStaticParams() {
  return ROUTE_PAGES.map((r) => ({ route: r.slug }));
}

/** W2 güzergâh sayfasının önizleme görseli; içerik sabit (derlemede üretilir), sayılar sayfada istek anında */
export default async function Image({ params }: { params: Promise<{ route: string }> }) {
  const r = routePage((await params).route);
  if (!r) notFound();
  return ogCard({ title: [`${r.from.name} → ${r.to.name}`, "nakliye"], chips: ["Tahmini ücret aralığı", "Karayolu mesafesi", "Yayındaki ilanlar"] });
}
