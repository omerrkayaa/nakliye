# Nakliye — Android uygulaması (Expo)

Expo SDK 57 · Expo Router · React Native 0.86. Ağırlıkla şoför/nakliyeci ekranları (docs/02 §4).

## Telefonda demo (Expo Go)

1. Bilgisayarda: veritabanı + API açık olmalı (`apps/api`, port 3000). Demo verisi: `cd apps/api && npm run db:seed-demo`.
2. `cd apps/mobile && npx expo start`
3. Telefona Play Store'dan **Expo Go** kurun, telefon bilgisayarla **aynı Wi-Fi**'da olsun, terminaldeki QR kodu okutun.
4. Giriş ekranında **Demo hesabıyla gir** (numara `0555 010 20 30`, kod `123456`; yalnız geliştirmede).

Bağlanamazsa:
- Windows Güvenlik Duvarı Node.js'e özel ağda izin vermeli (3000 ve 8081 portları).
- Bilgisayarda birden çok ağ adresi var (WSL 172.31.x). QR yanlış adresi gösterirse:
  `REACT_NATIVE_PACKAGER_HOSTNAME=<bilgisayarın Wi-Fi IP'si> npx expo start`
- API adresi Metro'nun adresinden türetilir (`<aynı IP>:3000`); farklıysa `EXPO_PUBLIC_API_URL` verin.

## Komutlar
| Komut | Ne yapar |
|---|---|
| `npx expo start` | Geliştirme sunucusu (Expo Go) |
| `npx expo start --web` | Tarayıcıda dene (API CORS açmadığı için yalnız test tarayıcısında, güvenlik kapalı) |
| `npm run typecheck` / `npx expo lint` | Tip ve lint kontrolü |

Paket eklerken `npx expo install <paket>` kullanın (SDK uyumlu sürüm). React sürümü kökteki `overrides` ile 19.2.3'e sabit: React Native tam sürüm eşleşmesi ister, web de aynı sürümü kullanır.
