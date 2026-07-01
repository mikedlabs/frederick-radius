import { ShoppingBag, UtensilsCrossed, CalendarCheck, Bike, ChefHat, Gift, ExternalLink } from "lucide-react";
import type { Place } from "@/data/places";
import type { CommerceLinkType } from "@/lib/commerce/types";
import { resolveCommerceLinks, selectCardCommerceActions, commerceCardLabel } from "@/lib/commerce/links";

const TYPE_ICON: Record<CommerceLinkType, typeof ShoppingBag> = {
  menu: UtensilsCrossed,
  order: ShoppingBag,
  reservation: CalendarCheck,
  delivery: Bike,
  catering: ChefHat,
  gift_card: Gift,
  other: ExternalLink,
};

/**
 * A single quiet commerce pill for a list/tile card (Order → Menu → Reserve
 * priority). Deliberately restrained: one short action, provider-agnostic label
 * (the named Toast treatment lives on the detail page), self-hides when a place
 * has no commerce link, so cards keep scanning as names not pills.
 *
 * Sits in a `relative z-10` layer and stops propagation so a tap opens the
 * provider link, not the card's detail sheet — the same pattern SaveButton uses.
 */
export default function CardCommerceAction({
  place,
  max = 1,
}: {
  place: Pick<
    Place,
    | "slug"
    | "commerce_links"
    | "opentable_id"
    | "resy_slug"
    | "order_url"
    | "menu_url"
    | "doordash_url"
    | "ubereats_url"
    | "grubhub_url"
    | "name"
  >;
  max?: number;
}) {
  const chosen = selectCardCommerceActions(resolveCommerceLinks(place), max);
  if (chosen.length === 0) return null;

  return (
    <div className="relative z-10 mt-1.5 flex flex-wrap gap-1.5">
      {chosen.map((l) => {
        const Icon = TYPE_ICON[l.type];
        return (
          <a
            key={`${l.type}-${l.url}`}
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${commerceCardLabel(l)}: ${place.name}`}
            className="tap-44-y inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)", background: "var(--app-bg-elevated)" }}
          >
            <Icon className="h-3 w-3" strokeWidth={1.75} aria-hidden style={{ color: "var(--app-brand)" }} />
            {commerceCardLabel(l)}
          </a>
        );
      })}
    </div>
  );
}
