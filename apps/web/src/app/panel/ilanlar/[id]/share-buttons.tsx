"use client";

import { useState } from "react";
import { Copy, Share2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

/** F8: WhatsApp'a tek dokunuş (wa.me herkese açık paylaşım adresi) ve bağlantıyı kopyala. Metin sunucuda shared'dan. */
export function ShareButtons({ text, url }: { text: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", className: "h-11" })}>
        <Share2 aria-hidden /> WhatsApp’ta paylaş
      </a>
      <Button
        type="button"
        variant="ghost"
        className="h-11"
        onClick={async () => {
          await navigator.clipboard.writeText(url).catch(() => undefined);
          setCopied(true);
        }}
      >
        <Copy aria-hidden /> {copied ? "Kopyalandı" : "Bağlantıyı kopyala"}
      </Button>
      <span className="sr-only" role="status">
        {copied ? "Bağlantı kopyalandı" : ""}
      </span>
    </div>
  );
}
