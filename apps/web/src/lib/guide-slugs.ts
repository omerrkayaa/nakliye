// Rehber yazılarının adresleri (/rehber/<ad>). Ayrı dosya: proxy JSX içeren lib/guides.tsx'i yüklemesin.
export const GUIDE_SLUGS = ["nakliye-belgeleri", "arac-tipleri", "parsiyel-yuk", "nakliye-fiyati-nasil-belirlenir"] as const;
export type GuideSlug = (typeof GUIDE_SLUGS)[number];
export const isGuideSlug = (s: string): s is GuideSlug => (GUIDE_SLUGS as readonly string[]).includes(s);
