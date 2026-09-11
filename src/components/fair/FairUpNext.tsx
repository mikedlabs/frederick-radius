import { Clock3, MapPin, ChevronRight, Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { MagicCard } from "../ui/MagicCard";

export default function FairUpNext() {
  return (
    <MagicCard
      className="mt-4"
    >
      <section
        data-fair-up-next
        aria-label="Up next at the Fair"
      >
      <div
        className="flex items-center justify-between border-b px-4 py-2.5"
        style={{ borderColor: "color-mix(in srgb, var(--app-border-strong) 40%, transparent)", background: "color-mix(in srgb, var(--app-brand) 5%, transparent)" }}
      >
        <h3 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-[var(--app-brand-press)]">
          <Clock3 className="h-4 w-4" /> Up Next
        </h3>
        <span className="relative flex items-center gap-1.5 rounded-full bg-[var(--app-brand)] pl-2 pr-2.5 py-0.5 text-[10px] font-bold text-[var(--app-on-brand)]">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--app-on-brand)] opacity-75"></span>
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--app-on-brand)]"></span>
          </span>
          In 30 mins
        </span>
      </div>
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h4 className="text-[18px] font-extrabold leading-tight tracking-[-0.02em] text-[var(--app-ink)]">
              Demolition Derby: Cars
            </h4>
            <div className="mt-2 flex flex-col gap-1.5 text-[13px] font-medium leading-snug text-[var(--app-ink-2)]">
              <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" /> 7:00 PM – 9:00 PM</span>
              <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Grandstand</span>
            </div>
          </div>
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-[var(--app-bg)] shadow-sm active:scale-95"
            style={{ borderColor: "var(--app-border)" }}
            aria-label="Star this event"
          >
            <Star className="h-5 w-5 text-yellow-500 drop-shadow-sm" />
          </button>
        </div>
        <div className="mt-4">
          <Button
            size="sm"
            variant="secondary"
            className="w-full justify-between font-bold"
            iconRight={<ChevronRight className="h-4 w-4" />}
          >
            View Full Schedule
          </Button>
        </div>
      </div>
    </section>
    </MagicCard>
  );
}
