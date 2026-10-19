import { notFound } from "next/navigation";
import { GUIDES, guide } from "@/lib/guides";
import { OG_SIZE, ogCard } from "@/lib/og";

export const alt = "Nakliye rehberi: yük sahipleri ve nakliyeciler için kısa yazı";
export const size = OG_SIZE;
export const contentType = "image/png";

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

/** Rehber yazısının önizleme görseli: sayfa openGraph verdiği için kökteki genel görsel bu sayfalara geçmiyordu */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const g = guide((await params).slug);
  if (!g) notFound();
  return ogCard({ title: [g.title], chips: ["Nakliye rehberi", "Yük sahipleri ve nakliyeciler için"] });
}
