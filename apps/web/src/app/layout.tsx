import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SITE_URL } from "@/lib/site";
import { ThemeScript } from "@/components/theme-script";
import "./globals.css";

// Türkçe karakterler (ı, ş, ğ, İ) latin-ext alt kümesinde
const inter = Inter({ variable: "--font-sans", subsets: ["latin", "latin-ext"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Nakliye", template: "%s · Nakliye" },
  description: "Gördüğün her yük gerçek ve şu an geçerli. Yük sahibi ile nakliyeciyi buluşturan platform.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme'i satır içi betik yazar (sunucu kullanıcının temasını bilmez); suppressHydrationWarning bu farkı kabul ettirir
    <html lang="tr" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
