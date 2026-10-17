// Açık/koyu tema. Seçim tarayıcıda (localStorage "tema": "koyu" | "acik") saklanır; seçim yoksa sistem tercihi izlenir.
// Değer <html data-theme> özniteliğine yazılır (globals.css `dark` çeşidi buna bakar).

export const THEME_KEY = "tema";

/**
 * <head> içinde HTML ayrıştırılırken çalışır: ilk boyamadan önce tema yazılır, açık temadan koyuya yanıp sönme olmaz
 * (Next belgesi: preventing-flash-before-hydration). Seçim yoksa sistem teması değişince sayfa da değişir.
 */
export const THEME_SCRIPT = `(function(){try{var k="${THEME_KEY}",q=matchMedia("(prefers-color-scheme: dark)");function a(){var t=null;try{t=localStorage.getItem(k)}catch(e){}document.documentElement.setAttribute("data-theme",t==="koyu"||(t!=="acik"&&q.matches)?"dark":"light")}a();q.addEventListener("change",a)}catch(e){}})()`;

export function isDark(): boolean {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

/** Tema değişince (düğme ya da sistem) çağrılır; aboneliği kaldıran işlev döner. */
export function onThemeChange(cb: () => void): () => void {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}

export function setTheme(dark: boolean) {
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  try {
    localStorage.setItem(THEME_KEY, dark ? "koyu" : "acik");
  } catch {
    // gizli pencere vb.: seçim yalnız bu sayfada geçerli olur
  }
}
