# OSRM (F7 karayolu mesafesi)

Fiyat aralığı (`GET /api/v1/price-estimate`) ilçe merkezleri arası **karayolu** mesafesini kendi OSRM sunucumuzdan alır.
Ücretsiz ve çevrimdışı çalışır (Google Maps gibi ücretli servis yok). Veri: OpenStreetMap (© OpenStreetMap katkıcıları, ODbL) —
il/ilçe verisiyle aynı kaynak. API her ilçe çiftini bir kez sorar ve `district_routes` tablosunda saklar; OSRM kapalıysa
kuş uçuşu × 1,3 tahminine düşer (yanıtta `source: "kus_ucusu"`).

## Bir kez: veriyi hazırla (~650 MB indirme, birkaç dakika işlem, birkaç GB bellek)

```bash
cd infra/data/osrm   # infra/data/ git dışında
curl -L -o turkey.osm.pbf https://download.geofabrik.de/europe/turkey-latest.osm.pbf
IMG=ghcr.io/project-osrm/osrm-backend:latest
docker run --rm -v "$PWD:/data" $IMG osrm-extract -p /opt/car.lua /data/turkey.osm.pbf
docker run --rm -v "$PWD:/data" $IMG osrm-partition /data/turkey.osrm
docker run --rm -v "$PWD:/data" $IMG osrm-customize /data/turkey.osrm
```

(Git Bash'te `$PWD` yerine Windows yolu gerekirse: `-v "C:/Users/.../nakliye/infra/data/osrm:/data"`.)

## Çalıştır

```bash
docker compose -f infra/docker-compose.yml up -d osrm
curl "http://localhost:5000/route/v1/driving/27.13,38.42;27.84,37.85?overview=false"   # Konak → Efeler
```

API `.env`: `OSRM_URL=http://localhost:5000`. Harita güncellemek için aynı adımları yeni dosyayla tekrarlayın ve
`district_routes` tablosunu boşaltın (`truncate district_routes`).
