"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "cn";
import { isDark, onThemeChange, setTheme, THEME_SCRIPT } from "@/lib/theme";

/**
 * Açık/koyu tema düğmesi. Simge CSS ile seçilir (sunucu temayı bilmez, ilk boyamada doğru simge görünsün);
 * aria-pressed ise hidrasyondan sonra gerçek temayı gösterir.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const dark = useSyncExternalStore(onThemeChange, isDark, () => false);
  // Geliştirmede React Strict Mode <html> özniteliklerini sıfırlıyor; temayı yeniden yaz (yayında etkisiz)
  useLayoutEffect(() => {
    if (!document.documentElement.hasAttribute("data-theme")) new Function(THEME_SCRIPT)();
  }, []);
  return (
    <button
      type="button"
      aria-label="Koyu tema"
      aria-pressed={dark}
      title={dark ? "Açık temaya geç" : "Koyu temaya geç"}
      onClick={() => setTheme(!isDark())}
      className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-md hover:bg-muted", className)}
    >
      <Moon className="size-5 dark:hidden" aria-hidden />
      <Sun className="hidden size-5 dark:block" aria-hidden />
    </button>
  );
}
