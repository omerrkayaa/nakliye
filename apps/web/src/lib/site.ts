// Sitenin dışarıdan görünen adresi: paylaşım bağlantıları ve önizleme kartı (Open Graph) mutlak adres ister.
// Yayında SITE_URL verilmeli; geliştirmede yerel adres.
export const SITE_URL = (process.env.SITE_URL ?? "http://localhost:3001").replace(/\/$/, "");
