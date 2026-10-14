import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // FR-05 belge yükleme (en çok 10 MB + çok parçalı form payı): proxy gövdeyi varsayılan 10 MB'ta sessizce keserdi.
  // Bu sınır proxy'den geçen tüm yollara uygulanır; varsayılan da zaten 10 MB, fark 1 MB. Sunucu eylemlerinin sınırı
  // varsayılan 1 MB'ta kalır: vergi levhası rota işleyicisiyle gider (panel/firma/levha; belge güvenlik incelemesi bulgu 5).
  experimental: {
    proxyClientMaxBodySize: "11mb",
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
