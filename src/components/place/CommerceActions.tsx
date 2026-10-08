import { Fragment } from "react";
import { UtensilsCrossed, ShoppingBag, CalendarCheck, Bike, ChefHat, Gift, ExternalLink } from "lucide-react";
import SectionHeading from "@/components/ui/SectionHeading";
import { formatChecked } from "@/lib/trust";
import type { CommerceLink, CommerceLinkType } from "@/lib/commerce/types";
import {
  commerceActionLabel,
  commerceTrustLine,
  orderCommerceForDetail,
} from "@/lib/commerce/links";
import ReportLinkButton from "./ReportLinkButton";
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

/** One clear lead action, shown first: order-ahead, else menu, else reserve. */
const PRIMARY_PRIORITY: CommerceLinkType[] = ["order", "menu", "reservation"];

function decisionActionForCommerce(type: CommerceLinkType): DecisionAction {
  if (type === "menu") return "menu";
  if (type === "reservation") return "reservation";
  if (type === "order" || type === "delivery" || type === "catering") return "order";
  return "website";
}

/**
 * The quiet line under the rows. The Toast handoff is named once: when it
 * leads, the trust line's own "Toast" provider token is dropped so the line
 * never reads "Ordering via Toast · Toast · Imported".
 */
export function commerceSupportSegments(toastOrdering: boolean, trustLine: string): string[] {
  const trust = trustLine ? trustLine.split(" · ") : [];
  return toastOrdering
    ? ["Ordering via Toast", ...trust.filter((token) => token !== "Toast")]
    : trust;
}

/** The section title follows what the links actually offer. */
export function commerceSectionTitle(links: CommerceLink[]): string {
  if (links.some((l) => l.type === "menu" || l.type === "order")) return "Menu and ordering";
  if (links.some((l) => l.type === "reservation")) return "Reservations";
  return "Ordering";
}

/**
 * The place-detail commerce section: a "Menu and ordering" section on paper,
 * set after the hours and visit details. Each resolved link (order, menu,
 * reserve, delivery, catering, gift card) is one 52px ruled row with its type
 * icon, its label and the external-link mark, because each opens another
 * site. The lead action comes first, Toast is named as a handoff, trust and
 * freshness print only when they are real, and a broken link can be reported.
 * Self-hides when a place has no commerce links.
 *
 * No row is a button or a Brick fill: Directions is the place page's one
 * primary action, and the phone dock keeps its own order affordance. Four
 * outlined chips in the first phone screen (October 2026 review) read as a
 * card of controls, not a page.
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
  const title = commerceSectionTitle(ordered);

  // Trust line only when it says something real (verified / owner / dated) —
  // a bare "Curated link" under every restaurant would just be noise.
  const trustLine =
    primary &&
    (primary.is_verified ||
      Boolean(primary.last_verified_at) ||
      primary.source === "owner")
      ? commerceTrustLine(primary, formatChecked(primary.last_verified_at))
      : "";
  const support = commerceSupportSegments(toastOrdering, trustLine);

  return (
    <section aria-label={title} data-place-commerce className="space-y-2">
      <SectionHeading size="sm" title={title} />

      <ul className="border-t" style={{ borderColor: "var(--app-border)" }}>
        {displayLinks.map((l) => {
          const Icon = TYPE_ICON[l.type];
          return (
            <li key={`${l.type}-${l.url}`} className="border-b" style={{ borderColor: "var(--app-border)" }}>
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                data-decision-action={decisionActionForCommerce(l.type)}
                className="flex min-h-13 items-center gap-3 text-body font-semibold transition-colors hover:bg-[var(--app-bg-sunken)] active:bg-[var(--app-bg-sunken)]"
                style={{ color: "var(--app-ink)" }}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden style={{ color: "var(--app-ink-3)" }} />
                <span className="min-w-0 flex-1">{commerceActionLabel(l)}</span>
                <ExternalLink className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden style={{ color: "var(--app-ink-3)" }} />
              </a>
            </li>
          );
        })}
      </ul>

      <div className="text-meta flex flex-wrap items-center gap-x-2" style={{ color: "var(--app-ink-3)" }}>
        {support.map((segment) => (
          <Fragment key={segment}>
            <p>{segment}</p>
            <span aria-hidden>·</span>
          </Fragment>
        ))}
        <ReportLinkButton
          placeSlug={placeSlug}
          placeName={placeName}
          links={displayLinks}
        />
      </div>
    </section>
  );
}
