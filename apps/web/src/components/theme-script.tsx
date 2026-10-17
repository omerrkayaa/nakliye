"use client";

import { THEME_SCRIPT } from "@/lib/theme";

/**
 * Temayı ilk boyamadan önce yazan satır içi betik. İstemcide "text/plain" olur: React istemcide <script> çizince uyarır,
 * betik zaten sunucu HTML'iyle çalışmıştır (Next belgesi: preventing-flash-before-hydration, InlineScript).
 */
export function ThemeScript() {
  return <script type={typeof window === "undefined" ? "text/javascript" : "text/plain"} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}
