import { UtensilsCrossed, ShoppingBag, CalendarCheck, Bike, ChefHat, Gift, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatChecked } from "@/lib/trust";
import type { CommerceLink, CommerceLinkType } from "@/lib/commerce/types";
import {
  commerceActionLabel,
  commerceTrustLine,
  isToastConnected,
  orderCommerceForDetail,
} from "@/lib/commerce/links";
import ReportLinkButton from "./ReportLinkButton";

const TYPE_ICON: Record<CommerceLinkType, typeof ShoppingBag> = {
  menu: UtensilsCrossed,
  order: ShoppingBag,
  reservation: CalendarCheck,
  delivery: Bike,
  catering: ChefHat,
  gift_card: Gift,
  other: ExternalLink,
};

/** One clear lead action: order-ahead, else menu, else reserve. */
const PRIMARY_PRIORITY: CommerceLinkType[] = ["order", "menu", "reservation"];

/**
 * The place-detail commerce section — one calm block that supersedes the old
 * separate Reserve/Order rows. Renders resolved commerce links (menu / order /
 * reserve / delivery / catering) with a single brand-filled primary and quiet
 * pills for the rest, honest Toast labeling, trust/freshness where it's real,
 * and a broken-link report. Self-hides when a place has no commerce links.
 */
export default function CommerceActions({
  links,
  placeSlug,
  placeName,
}: {
  links: CommerceLink[];
  placeSlug: string;
  placeName: string;
}) {
  if (!links || links.length === 0) return null;

  const ordered = orderCommerceForDetail(links);

  let primaryIdx = -1;
  for (const t of PRIMARY_PRIORITY) {
    const i = ordered.findIndex((l) => l.type === t);
    if (i >= 0) {
      primaryIdx = i;
      break;
    }
  }

  const toast = isToastConnected(links);
  const hasMenuOrOrder = ordered.some((l) => l.type === "menu" || l.type === "order");
  const hasReservation = ordered.some((l) => l.type === "reservation");
  const hasTransactional = ordered.some(
    (l) => l.type === "order" || l.type === "delivery" || l.type === "reservation",
  );
  const title = hasMenuOrOrder ? "Menu & ordering" : hasReservation ? "Reservations" : "Order";

  // Trust line only when it says something real (verified / owner / dated) —
  // a bare "Curated link" under every restaurant would just be noise.
  const primary = primaryIdx >= 0 ? ordered[primaryIdx] : undefined;
  const showTrust =
    primary && (primary.is_verified || Boolean(primary.last_verified_at) || primary.source === "owner");
  const trustLine = showTrust
    ? commerceTrustLine(primary, formatChecked(primary.last_verified_at))
    : "";

  return (
    <section className="space-y-2">
      <h2 className="eyebrow inline-flex items-center gap-1.5">
        <UtensilsCrossed className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden style={{ color: "var(--app-cool)" }} />
        {title}
        {toast && (
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal"
            style={{
              background: "color-mix(in srgb, var(--app-brand) 12%, transparent)",
              color: "var(--app-brand-press)",
            }}
          >
            Toast-connected
          </span>
        )}
      </h2>

      <div className="flex flex-wrap gap-1.5">
        {ordered.map((l, i) => {
          const Icon = TYPE_ICON[l.type];
          const isPrimary = i === primaryIdx;
          return (
            <Button
              key={`${l.type}-${l.url}`}
              variant={isPrimary ? "primary" : "secondary"}
              size="sm"
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full"
              iconLeft={<Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />}
              iconRight={
                isPrimary ? undefined : (
                  <ExternalLink className="h-3 w-3" strokeWidth={1.75} aria-hidden style={{ color: "var(--app-ink-3)" }} />
                )
              }
            >
              {commerceActionLabel(l)}
            </Button>
          );
        })}
      </div>

      {trustLine && (
        <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
          {trustLine}
        </p>
      )}
      {hasTransactional && (
        <p className="text-[12px]" style={{ color: "var(--app-ink-3)" }}>
          Opens with the restaurant&apos;s provider.
        </p>
      )}

      <ReportLinkButton placeSlug={placeSlug} placeName={placeName} />
    </section>
  );
}
