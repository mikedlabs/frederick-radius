import Skeleton from "@/components/ui/Skeleton";
import { ChevronRight } from "lucide-react";

export default function SmartIslandSkeleton() {
  return (
    <div
      className="relative z-50 mx-auto w-full max-w-[360px] overflow-hidden rounded-[32px] bg-[var(--app-bg-elevated-solid)] text-left shadow-lg"
      style={{
        boxShadow: `0 12px 40px -12px rgba(148, 163, 184, 0.4), inset 0 1px 1px rgba(255,255,255,0.1)`,
        border: `1px solid rgba(148, 163, 184, 0.5)`,
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      <div className="flex flex-col px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Skeleton.Block width={32} height={32} round="16px" className="shrink-0" />
            <div className="flex items-baseline gap-2 truncate">
              <Skeleton.Block width={28} height={22} />
              <Skeleton.Block width={140} height={14} />
            </div>
          </div>
          <ChevronRight
            className="h-4 w-4 shrink-0 opacity-20"
            strokeWidth={2.5}
          />
        </div>
      </div>
    </div>
  );
}
