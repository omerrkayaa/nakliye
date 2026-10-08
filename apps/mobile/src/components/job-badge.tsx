import { JOB_STATUS_LABELS, type JobStatus } from "@nakliye/shared";
import { Badge } from "@/components/ui";

export function jobBadge(status: JobStatus) {
  const tone = status === "tamamlandi" ? "ok" : status === "iptal" || status === "itirazli" ? "idle" : "warn";
  const icon = status === "tamamlandi" ? "checkmark-circle" : status === "iptal" ? "close-circle-outline" : "car-outline";
  return <Badge tone={tone} icon={icon} label={JOB_STATUS_LABELS[status]} />;
}
