import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { s } from "@/components/ui";
import { C, TOUCH } from "@/lib/theme";
import type { Province } from "@/lib/types";

const fold = (t: string) => t.toLocaleLowerCase("tr-TR");

/** "Nereden / Nereye" il seçici: tam ekran liste + arama. null = her yer. */
export function ProvincePicker({
  label,
  provinces,
  value,
  onChange,
}: {
  label: string;
  provinces: Province[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = provinces.find((p) => p.id === value);
  const list = useMemo(() => provinces.filter((p) => fold(p.name).includes(fold(q.trim()))), [provinces, q]);

  const pick = (id: number | null) => {
    onChange(id);
    setOpen(false);
    setQ("");
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.name ?? "Her yer"}`}
        onPress={() => setOpen(true)}
        style={{ flex: 1, minHeight: TOUCH, borderWidth: 1, borderColor: C.border, borderRadius: 10, backgroundColor: C.card, paddingHorizontal: 12, justifyContent: "center" }}
      >
        <Text style={{ fontSize: 12, color: C.muted }}>{label}</Text>
        <Text style={{ fontSize: 16, fontWeight: "600", color: C.text }} numberOfLines={1}>
          {selected?.name ?? "Her yer"}
        </Text>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={{ flexDirection: "row", alignItems: "center", padding: 12, gap: 8 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Kapat" onPress={() => setOpen(false)} style={{ width: TOUCH, height: TOUCH, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="close" size={26} color={C.text} />
            </Pressable>
            <TextInput
              autoFocus
              accessibilityLabel={`${label} ara`}
              placeholder="İl ara"
              placeholderTextColor={C.muted}
              value={q}
              onChangeText={setQ}
              style={[s.input, { flex: 1 }]}
            />
          </View>
          <FlatList
            data={list}
            keyExtractor={(p) => String(p.id)}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={!q ? <Row text="Her yer" onPress={() => pick(null)} selected={value === null} /> : null}
            renderItem={({ item }) => <Row text={item.name} onPress={() => pick(item.id)} selected={item.id === value} />}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

function Row({ text, onPress, selected }: { text: string; onPress: () => void; selected: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{ minHeight: 52, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: C.border }}
    >
      <Text style={{ fontSize: 17, color: C.text, fontWeight: selected ? "700" : "400" }}>{text}</Text>
      {selected && <Ionicons name="checkmark" size={22} color={C.primary} />}
    </Pressable>
  );
}
