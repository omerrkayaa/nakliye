# Yazı tipi: Inter'in Türkçe alt kümesi

`inter-tr.woff2` (3 KB): Inter 4.001 değişken yazı tipinden (wght 100–900) yalnız **Ğ ğ İ Ş ş ₺** glifleri.
Lisans: SIL Open Font License 1.1 (`OFL.txt`; Inter'de ayrılmış yazı tipi adı yok, alt küme çıkarmak serbest).

**Neden:** Google'ın `latin` alt kümesinde Türkçeden yalnız ı var; ğ, ş ve İ `latin-ext`te. `latin-ext` 85 KB ve
sitede ondan yalnız bu glifler kullanılıyor. `app/layout.tsx` Google'dan yalnız `latin`i (48 KB) alır; bu dosya aynı
yazı tipinin eksik gliflerini `unicode-range` ile tamamlar. Her sayfanın ilk açılışı ~80 KB hafifledi (2026-10-19 ölçümü).
`next/font` Google'ın bütün alt kümelerini `unicode-range` ile tanımlar, `subsets` yalnız ön yüklenecekleri seçer. Bu
yüzden burada olmayan bir harf (ör. kullanıcının yazdığı ă, ž) gelirse tarayıcı `latin-ext`i yalnız o zaman indirir; harf
yine Inter'le görünür (Chrome'da denendi).

**Yeniden üretmek** (glif eklemek gerekirse; fontTools ücretsiz: `py -m pip install --user fonttools brotli`):
1. `app/layout.tsx`'te geçici olarak `subsets: ["latin", "latin-ext"]` verip `npm run build`.
2. `.next/static/media/` altında `latin-ext` dosyasını bulun (en büyük `.woff2`, ~85 KB; `₺` içerir).
3. `py -m fontTools.subset <dosya> --unicodes="U+011E-011F,U+0130,U+015E-015F,U+20BA" --layout-features='*' --flavor=woff2 --output-file=inter-tr.woff2`
4. `layout.tsx`'teki `unicode-range` aynı listeyle güncellenir.
