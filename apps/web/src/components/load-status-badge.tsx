import { LOAD_STATUS_LABELS, type LoadStatus } from "@nakliye/shared";
import { CircleCheck, CircleX, Clock, FilePen, Hourglass, Lock, TimerOff, type LucideIcon } from "lucide-react";
import { cn } from "cn";

// Durum yalnız renkle değil ikon ve metinle de belirtilir (docs/02 §7, renk körlüğü)
const STYLE: Record<LoadStatus, { icon: LucideIcon; className: string }> = {
  teyitli: { icon: CircleCheck, className: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  teyit_bekliyor: { icon: Clock, className: "bg-amber-50 text-amber-900 border-amber-300" },
  moderasyonda: { icon: Hourglass, className: "bg-sky-50 text-sky-900 border-sky-200" },
  suresi_doldu: { icon: TimerOff, className: "bg-muted text-muted-foreground border-border" },
  kapandi: { icon: Lock, className: "bg-muted text-muted-foreground border-border" },
  iptal: { icon: CircleX, className: "bg-muted text-muted-foreground border-border" },
  taslak: { icon: FilePen, className: "bg-muted text-muted-foreground border-border" },
};

export function LoadStatusBadge({ status }: { status: LoadStatus }) {
  const { icon: Icon, className } = STYLE[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", className)}>
      <Icon className="size-3.5" aria-hidden />
      {LOAD_STATUS_LABELS[status]}
    </span>
  );
}
