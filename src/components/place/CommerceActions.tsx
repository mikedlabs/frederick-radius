import { UtensilsCrossed, ShoppingBag, CalendarCheck, Bike, ChefHat, Gift, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatChecked } from "@/lib/trust";
import type { CommerceLink, CommerceLinkType } from "@/lib/commerce/types";
import {
  commerceActionLabel,
  commerceTrustLine,
  orderCommerceForDetail,
} from "@/lib/commerce/links";
import ReportLinkButton from "./ReportLinkButton";
import { PLACE_SECTION_LABEL_CLASS } from "./PlaceSectionLabel";
import type { DecisionAction } from "@/lib/decision/telemetry";

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

function decisionActionForCommerce(type: CommerceLinkType): DecisionAction {
  if (type === "menu") return "menu";
  if (type === "reservation") return "reservation";
  if (type === "order" || type === "delivery" || type === "catering") return "order";
  return "website";
}

/**
 * The place-detail commerce section — one calm block that supersedes the old
 * separate Reserve/Order rows. Renders resolved commerce links (menu / order /
 * reserve / delivery / catering) as outlined 6px buttons with the lead action
 * first, honest Toast labeling, trust/freshness where it's real,
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

  let primary: CommerceLink | undefined;
  for (const t of PRIMARY_PRIORITY) {
    const match = ordered.find((l) => l.type === t);
    if (match) {
      primary = match;
      break;
    }
  }
  const displayLinks = primary
    ? [primary, ...ordered.filter((link) => link !== primary)]
    : ordered;

  const toastOrdering = ordered.some(
    (link) =>
      link.provider === "toast" &&
      (link.type === "menu" || link.type === "order"),
  );
  const hasMenuOrOrder = ordered.some((l) => l.type === "menu" || l.type === "order");
  const hasReservation = ordered.some((l) => l.type === "reservation");
  const title = hasMenuOrOrder ? "Menu & ordering" : hasReservation ? "Reservations" : "Order";

  // Trust line only when it says something real (verified / owner / dated) —
  // a bare "Curated link" under every restaurant would just be noise.
  const trustLine =
    primary &&
    (primary.is_verified ||
      Boolean(primary.last_verified_at) ||
      primary.source === "owner")
      ? commerceTrustLine(primary, formatChecked(primary.last_verified_at))
      : "";

  return (
    <section className="space-y-2">
      {/* PLAIN TOOL: the Toast handoff note is plain text beside the label,
          not a tinted capsule. */}
      <h2 className={`flex flex-wrap items-baseline gap-x-2 ${PLACE_SECTION_LABEL_CLASS}`} style={{ color: "var(--app-ink-3)" }}>
        {title}
        {toastOrdering && (
          <span className="text-[13px] font-medium normal-case tracking-normal" style={{ color: "var(--app-ink-2)" }}>
            Ordering via Toast
          </span>
        )}
      </h2>

      {/* Directions is the page's one filled coral action, so every commerce
          link is an outlined 6px button in ink. The lead action (order, else
          menu, else reserve) still comes first. */}
      <div className="flex flex-wrap gap-2">
        {displayLinks.map((l) => {
          const Icon = TYPE_ICON[l.type];
          return (
            <Button
              key={`${l.type}-${l.url}`}
              variant="secondary"
              size="md"
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              data-decision-action={decisionActionForCommerce(l.type)}
              className="border bg-transparent text-[15px]"
              style={{ borderColor: "var(--app-control-border)", backgroundColor: "transparent", color: "var(--app-ink)" }}
              iconLeft={<Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden style={{ color: "var(--app-ink-2)" }} />}
              iconRight={<ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden style={{ color: "var(--app-ink-3)" }} />}
            >
              {commerceActionLabel(l)}
            </Button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-2">
        {trustLine && (
          <>
            <p className="text-[13px]" style={{ color: "var(--app-ink-3)" }}>
              {trustLine}
            </p>
            <span aria-hidden className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
              ·
            </span>
          </>
        )}
        <ReportLinkButton
          placeSlug={placeSlug}
          placeName={placeName}
          links={displayLinks}
        />
      </div>
    </section>
  );
}
