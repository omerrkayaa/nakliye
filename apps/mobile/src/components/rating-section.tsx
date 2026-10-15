import Ionicons from "@expo/vector-icons/Ionicons";
import { RATING_TAGS, RATING_TAGS_FOR, trDay, type RatingTag } from "@nakliye/shared";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, Card, Chip, ErrorText, Field, Muted, s } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { dayText } from "@/lib/format";
import { C } from "@/lib/theme";
import type { JobDetail, RatingView } from "@/lib/types";

const Stars = ({ n }: { n: number }) => <Text style={{ color: C.accentText, fontSize: 18 }}>{"★".repeat(n) + "☆".repeat(5 - n)}</Text>;

function RatingLine({ title, r }: { title: string; r: RatingView }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={s.label}>{title}</Text>
      <Stars n={r.stars} />
      {r.tags.length > 0 && <Muted>{r.tags.map((t) => RATING_TAGS[t]).join(" · ")}</Muted>}
      {r.comment && <Text style={s.text}>{r.comment}</Text>}
    </View>
  );
}

/** A13 — Puanlama (FR-40): kör puanlama; puanınız karşı taraf da puanlayınca ya da süre bitince görünür. */
export function RatingSection({ job, onRated }: { job: JobDetail; onRated: () => Promise<void> }) {
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<RatingTag[]>([]);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { rating } = job;
  if (!rating.given && !rating.canRate && !rating.received) return null;
  // Puanlanan taraf karşı taraftır: nakliyeci yük sahibini, yük sahibi nakliyeciyi puanlar
  const rateeSide = job.role === "carrier" ? "shipper" : "carrier";

  async function send() {
    if (stars === 0) return setError("1–5 arasında bir puan seçin");
    setBusy(true);
    setError(null);
    try {
      await api(`/jobs/${job.id}/rating`, { method: "POST", body: { stars, tags, comment: comment.trim() || undefined } });
      await onRated();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Puan gönderilemedi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={s.title}>
        Puanlama
      </Text>
      {rating.given ? (
        <RatingLine title="Verdiğiniz puan" r={rating.given} />
      ) : (
        rating.canRate && (
          <>
            <Muted>
              {rating.deadline ? `Son gün ${dayText(trDay(new Date(rating.deadline)))}. ` : ""}Puanınız, karşı taraf da puanlayınca ya da süre bitince görünür.
            </Muted>
            <View style={{ flexDirection: "row", gap: 4 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable
                  key={n}
                  accessibilityRole="button"
                  accessibilityLabel={`${n} yıldız`}
                  accessibilityState={{ selected: stars === n }}
                  onPress={() => setStars(n)}
                  style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}
                >
                  <Ionicons name={n <= stars ? "star" : "star-outline"} size={34} color={n <= stars ? C.accentText : C.muted} />
                </Pressable>
              ))}
            </View>
            <Text style={s.label}>Öne çıkanlar (isteğe bağlı)</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {RATING_TAGS_FOR[rateeSide].map((t) => (
                <Chip key={t} label={RATING_TAGS[t]} selected={tags.includes(t)} onPress={() => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))} />
              ))}
            </View>
            <Field label="Yorum (isteğe bağlı)" multiline maxLength={500} value={comment} onChangeText={setComment} style={{ minHeight: 72, textAlignVertical: "top", paddingTop: 12 }} />
            <Muted>Profilde adınız gösterilmeden görünür.</Muted>
            {error && <ErrorText>{error}</ErrorText>}
            <Button title="Puanı gönder" icon="star" variant="accent" busy={busy} onPress={send} />
          </>
        )
      )}
      {rating.received &&
        (rating.received.revealed ? <RatingLine title="Aldığınız puan" r={rating.received} /> : <Muted>Karşı taraf sizi puanladı. Puanı görmek için siz de puanlayın.</Muted>)}
    </Card>
  );
}
