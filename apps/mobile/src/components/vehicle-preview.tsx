import { BODY_TYPE_INFO, BODY_TYPES, TYPICAL_BODY, VEHICLE_TYPE_INFO, VEHICLE_TYPES, type BodyType, type VehicleType } from "@nakliye/shared";
import { Image, Text, View } from "react-native";
import { C } from "@/lib/theme";
import SIZES from "../../assets/vehicles/sizes.json";
import { Muted } from "./ui";

// Web'deki 3B modellerden çıkarılmış resimler (apps/web/scripts/render-vehicles.mjs); araçlar en sık kasasıyla, kasalar tır üstünde
const VEHICLE_IMAGES: Record<VehicleType, number> = {
  tir: require("../../assets/vehicles/tir.png"),
  kirkayak: require("../../assets/vehicles/kirkayak.png"),
  kamyon: require("../../assets/vehicles/kamyon.png"),
  kamyonet: require("../../assets/vehicles/kamyonet.png"),
  panelvan: require("../../assets/vehicles/panelvan.png"),
};
const BODY_IMAGES: Record<BodyType, number> = {
  tenteli: require("../../assets/vehicles/kasa-tenteli.png"),
  acik: require("../../assets/vehicles/kasa-acik.png"),
  kapali: require("../../assets/vehicles/kasa-kapali.png"),
  frigo: require("../../assets/vehicles/kasa-frigo.png"),
  damper: require("../../assets/vehicles/kasa-damper.png"),
  kayar_perde: require("../../assets/vehicles/kasa-kayar_perde.png"),
  lowbed: require("../../assets/vehicles/kasa-lowbed.png"),
};

/** Resimler kenarları kırpılmış olduğu için oran her birinin kendi boyutundan (betik yazar) */
const ratio = (file: string) => {
  const sz = (SIZES as Record<string, number[]>)[file];
  return sz?.[0] && sz[1] ? sz[0] / sz[1] : 16 / 9;
};

/** Araç/kasa seçiminin altında: seçilen tipin resmi ve tek cümlelik açıklaması (kullanıcı hangisinin hangisi olduğunu bilmeyebilir). */
export function VehiclePreview({ vehicle, body }: { vehicle: VehicleType | null; body: BodyType | null }) {
  if (!vehicle && !body) return null;
  // Araç seçiliyse ve kasa seçilmemiş/en sık kasasıysa aracın kendi resmi; değilse kasanın tır üstündeki resmi
  const ownImage = vehicle && (!body || body === TYPICAL_BODY[vehicle] || vehicle === "panelvan");
  const source = ownImage ? VEHICLE_IMAGES[vehicle] : BODY_IMAGES[body!];
  const file = ownImage ? `${vehicle}.png` : `kasa-${body}.png`;
  return (
    <View testID="vehicle-preview" style={{ gap: 6, backgroundColor: C.bg, borderRadius: 12, padding: 10 }}>
      <Image source={source} accessibilityIgnoresInvertColors accessible={false} style={{ width: "100%", aspectRatio: ratio(file), maxHeight: 200 }} resizeMode="contain" />
      {vehicle && (
        <Text style={{ color: C.text, fontSize: 14 }}>
          <Text style={{ fontWeight: "700" }}>{VEHICLE_TYPES[vehicle]}: </Text>
          {VEHICLE_TYPE_INFO[vehicle]}
        </Text>
      )}
      {body && (
        <Text style={{ color: C.text, fontSize: 14 }}>
          <Text style={{ fontWeight: "700" }}>{BODY_TYPES[body]}: </Text>
          {BODY_TYPE_INFO[body]}
        </Text>
      )}
      {!ownImage && vehicle && vehicle !== "tir" && <Muted>Kasa, görselde tır üstünde gösteriliyor.</Muted>}
    </View>
  );
}
