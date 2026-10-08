import { JOB_STATUS_LABELS, type JobStatus } from "@nakliye/shared";
import { CircleCheck, CircleX, Handshake, Package, PackageCheck, TriangleAlert, Truck, type LucideIcon } from "lucide-react";
import { cn } from "cn";

// Durum yalnız renkle değil ikon ve metinle de belirtilir (docs/02 §7)
const STYLE: Record<JobStatus, { icon: LucideIcon; className: string }> = {
  anlasildi: { icon: Handshake, className: "bg-sky-50 text-sky-900 border-sky-200" },
  yuklendi: { icon: Package, className: "bg-sky-50 text-sky-900 border-sky-200" },
  yolda: { icon: Truck, className: "bg-sky-50 text-sky-900 border-sky-200" },
  teslim_edildi: { icon: PackageCheck, className: "bg-amber-50 text-amber-900 border-amber-300" },
  tamamlandi: { icon: CircleCheck, className: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  itirazli: { icon: TriangleAlert, className: "bg-destructive/10 text-destructive border-destructive/30" },
  iptal: { icon: CircleX, className: "bg-muted text-muted-foreground border-border" },
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const { icon: Icon, className } = STYLE[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", className)}>
      <Icon className="size-3.5" aria-hidden />
      {JOB_STATUS_LABELS[status]}
    </span>
  );
}
