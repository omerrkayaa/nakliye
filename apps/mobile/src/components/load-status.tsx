import { LOAD_STATUS_LABELS } from "@nakliye/shared";
import { Badge } from "@/components/ui";
import { ago } from "@/lib/format";
import type { MyLoad } from "@/lib/types";

/** İlan durumu rozeti: renk + ikon + metin */
export function LoadStatusBadge({ load }: { load: Pick<MyLoad, "status" | "lastConfirmedAt"> }) {
  const label = LOAD_STATUS_LABELS[load.status];
  if (load.status === "teyitli") return <Badge tone="ok" icon="checkmark-circle" label={`${label} · ${ago(load.lastConfirmedAt)}`} />;
  if (load.status === "teyit_bekliyor") return <Badge tone="warn" icon="time-outline" label={`${label} · teyit edin`} />;
  if (load.status === "moderasyonda") return <Badge tone="warn" icon="hourglass-outline" label={label} />;
  return <Badge tone="idle" icon="pause-circle-outline" label={label} />;
}
