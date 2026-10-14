import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // FR-05 belge yükleme (en çok 10 MB + çok parçalı form payı). Proxy gövdeyi varsayılan 10 MB'ta sessizce keser,
  // sunucu eylemi sınırı varsayılan 1 MB (Next 16 belgesi).
  experimental: {
    proxyClientMaxBodySize: "11mb",
    serverActions: { bodySizeLimit: "11mb" },
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
