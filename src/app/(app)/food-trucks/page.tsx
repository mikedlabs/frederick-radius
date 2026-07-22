import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  ChevronDown,
  ExternalLink,
  Facebook,
  Globe,
  IceCream,
  Instagram,
  MapPin,
  Truck,
} from "lucide-react";
import { FOOD_TRUCKS, truckFeedUrl, type FoodTruck } from "@/data/food-trucks";
import { CATEGORY_BY_SLUG } from "@/data/categories";
import { resolveHomeBase } from "@/lib/food-trucks/live";
import { getFreshestBeaconByTruck } from "@/lib/loaders/truckBeacons";
import type { TruckBeacon } from "@/lib/food-trucks/beacon";
import TruckHomeStatus from "@/components/food-trucks/TruckHomeStatus";
import TruckLiveStatus from "@/components/food-trucks/TruckLiveStatus";
import PageBloom from "@/components/ui/PageBloom";
import { itemListJsonLd, jsonLdScript } from "@/lib/seo/jsonld";

/**
 * /food-trucks — a visual roster of Frederick County's mobile vendors.
 *
 * Trucks are grouped by craving rather than presented as one alphabetized
 * directory. The photography is owned Frederick Radius work; vendor cards use
 * an editorial cuisine treatment when the vendor has not supplied approved
 * imagery. That keeps the board lively without assigning a stock photo to a
 * real local business.
 */

const FOOD_ACCENT = CATEGORY_BY_SLUG["food-truck"]?.color ?? "var(--app-brand)";

type Flavor = "smoke" | "comfort" | "world" | "fresh" | "sweet";

const FLAVOR_GROUPS: ReadonlyArray<{
  id: Flavor;
  title: string;
  note: string;
}> = [
  { id: "smoke", title: "Smoke & spice", note: "These trucks serve barbecue, Cajun dishes, and slow-cooked favorites." },
  { id: "comfort", title: "Hot & comforting", note: "This group covers pizza, fries, sandwiches, and plenty of cheese." },
  { id: "world", title: "Around the world", note: "These kitchens serve Cuban, Mexican, Mediterranean, and Peruvian food." },
  { id: "fresh", title: "Fresh & caffeinated", note: "This group brings together bowls, farm cooking, smoothies, and coffee." },
  { id: "sweet", title: "Cold & sweet", note: "These trucks serve shaved ice and other cold treats." },
];

function flavorFor(truck: FoodTruck): Flavor {
  if (truck.kind === "treats") return "sweet";
  if (/barbecue|cajun/i.test(truck.cuisine)) return "smoke";
  if (/brewpub|pizza|fries|grilled cheese|sandwich/i.test(truck.cuisine)) return "comfort";
  if (/acai|coffee|farm-to-fork/i.test(truck.cuisine)) return "fresh";
  return "world";
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Food trucks & carts in Frederick County",
  description:
    "Frederick County's mobile food and treat vendors, with links to each vendor's latest location feed.",
  alternates: { canonical: "/food-trucks" },
  openGraph: {
    title: "Food trucks & carts in Frederick County",
    description:
      "Find Frederick County's mobile food and treat vendors, then check each vendor's latest location post.",
  },
};

function LinkChip({ href, label, Icon }: { href: string; label: string; Icon: typeof Globe }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="tap-44 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors hover:bg-[var(--app-bg-sunken)]"
      style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}
    >
      <Icon className="h-3 w-3" strokeWidth={2} aria-hidden />
      {label}
    </a>
  );
}

function TruckCard({
  truck,
  beacon,
  number,
}: {
  truck: FoodTruck;
  beacon?: TruckBeacon;
  number: number;
}) {
  const feed = truckFeedUrl(truck);
  const flavor = flavorFor(truck);
  const Icon = truck.kind === "treats" ? IceCream : Truck;
  const homeBase = resolveHomeBase(truck.homeBase);

  const statusFallback = homeBase ? (
    <TruckHomeStatus
      venueName={homeBase.name}
      venueSlug={homeBase.slug}
      hours={homeBase.hours}
      verified={homeBase.verified}
      accent={FOOD_ACCENT}
    />
  ) : truck.homeBase ? (
    <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: "var(--app-ink-2)" }}>
      <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden style={{ color: FOOD_ACCENT }} />
      Usually at {truck.homeBase}
    </p>
  ) : null;

  return (
    <li className="food-truck-card tactile w-[min(84vw,22rem)] shrink-0 snap-start overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] sm:w-auto">
      <div className="food-truck-card-art" data-flavor={flavor} aria-hidden>
        <span className="food-truck-card-number">{String(number).padStart(2, "0")}</span>
        <Icon className="food-truck-card-icon" strokeWidth={1.5} />
        <p>{truck.cuisine}</p>
      </div>

      <div className="flex min-h-[13rem] flex-col p-4">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: FOOD_ACCENT }}>
            {truck.kind === "treats" ? "Treat truck" : "Mobile kitchen"}
          </p>
          <h3 className="mt-1 font-serif text-[21px] font-semibold leading-[1.08] tracking-tight" style={{ color: "var(--app-ink)" }}>
            {truck.name}
          </h3>
        </div>

        {truck.blurb && (
          <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            {truck.blurb}
          </p>
        )}

        {beacon ? (
          <TruckLiveStatus beacon={beacon} accent={FOOD_ACCENT}>
            {statusFallback}
          </TruckLiveStatus>
        ) : (
          statusFallback
        )}

        {feed ? (
          <a
            href={feed}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Check the latest location post for ${truck.name}`}
            className="tap-44 mt-auto inline-flex items-center justify-between gap-2 rounded-[var(--app-radius-md)] px-3 py-2.5 text-[12px] font-semibold"
            style={{ background: "var(--app-brand)", color: "var(--app-on-brand)" }}
          >
            Check today&rsquo;s location
            <ArrowUpRight className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </a>
        ) : (
          <p className="mt-auto pt-3 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
            No current location feed is listed yet.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-1.5 pt-2">
          {truck.website && truck.website !== feed && <LinkChip href={truck.website} label="Website" Icon={Globe} />}
          {truck.instagram && truck.instagram !== feed && <LinkChip href={truck.instagram} label="Instagram" Icon={Instagram} />}
          {truck.facebook && truck.facebook !== feed && <LinkChip href={truck.facebook} label="Facebook" Icon={Facebook} />}
        </div>
      </div>
    </li>
  );
}

export default async function FoodTrucksPage() {
  const beaconByTruck = await getFreshestBeaconByTruck();
  const liveCount = beaconByTruck.size;
  const foodCount = FOOD_TRUCKS.filter((truck) => truck.kind === "food").length;
  const treatCount = FOOD_TRUCKS.length - foodCount;

  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Food trucks & carts in Frederick County",
    description: "Browse Frederick County's mobile food and treat vendors.",
    mainEntity: itemListJsonLd(
      "Food trucks in Frederick County",
      FOOD_TRUCKS.map((truck) => ({ name: truck.name, path: "/food-trucks" })),
    ),
  };

  return (
    <div className="relative space-y-7">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(collectionJsonLd) }} />
      <PageBloom variant="single" />

      <header className="food-truck-hero">
        <Image
          src="/images/seasons/summer/SUMMER STREETS.jpg"
          alt="An aerial view across Downtown Frederick toward the county landscape"
          fill
          priority
          sizes="(max-width: 768px) 100vw, 960px"
          className="object-cover object-center"
        />
        <div className="food-truck-hero-shade" />
        <div className="food-truck-hero-copy">
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em]">
            Frederick County · {FOOD_TRUCKS.length} mobile vendors
          </p>
          <h1>Find the food trucks.</h1>
          <p>
            Pick what sounds good and open the vendor&rsquo;s latest post to see where they pulled in.
          </p>
          <div
            className="food-truck-hero-counts"
            aria-label={`${foodCount} food vendors and ${treatCount} treat vendors${liveCount > 0 ? `, with ${liveCount} live now` : ""}`}
          >
            <span><strong>{foodCount}</strong> savory</span>
            <span><strong>{treatCount}</strong> sweet</span>
            {liveCount > 0 ? <span><strong>{liveCount}</strong> live now</span> : null}
          </div>
        </div>
        <span className="food-truck-photo-credit">Original Frederick Radius photography</span>
      </header>

      <nav aria-label="Food truck categories" className="shelf-rail -mx-4 gap-2 px-4 sm:mx-0 sm:px-0">
        {FLAVOR_GROUPS.map((group) => {
          const count = FOOD_TRUCKS.filter((truck) => flavorFor(truck) === group.id).length;
          return (
            <a
              key={group.id}
              href={`#${group.id}`}
              className="tap-44 inline-flex shrink-0 items-center gap-2 rounded-full border bg-[var(--app-bg-elevated)] px-3.5 py-2 text-[12px] font-semibold"
              style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
            >
              {group.title}
              <span className="font-mono text-[10px]" style={{ color: "var(--app-ink-3)" }}>{count}</span>
            </a>
          );
        })}
      </nav>

      <aside
        className="food-truck-owner-door rounded-[var(--app-radius-lg)] border p-4 sm:flex sm:items-center sm:justify-between sm:gap-5"
        style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
      >
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: FOOD_ACCENT }}>
            For truck owners
          </p>
          <p className="mt-1 font-serif text-[20px] leading-tight" style={{ color: "var(--app-ink)" }}>
            Your truck can join the board.
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            Claim a listed truck to post live locations, or send a missing truck for review. There is no owner account to maintain.
          </p>
        </div>
        <div className="mt-3 grid shrink-0 grid-cols-2 gap-2 sm:mt-0 sm:flex">
          <Link
            href="/food-trucks/claim"
            className="tap-44 inline-flex items-center justify-center rounded-full border px-3.5 py-2.5 text-center text-[12px] font-semibold"
            style={{ borderColor: "var(--app-border)", color: "var(--app-ink)" }}
          >
            Claim a listing
          </Link>
          <Link
            href="/submit/place?category=food-truck"
            className="tap-44 inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-2.5 text-center text-[12px] font-semibold"
            style={{ background: "var(--app-ink)", color: "var(--app-bg)" }}
          >
            Add my truck
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </Link>
        </div>
      </aside>

      <details className="food-truck-how rounded-[var(--app-radius-md)] border bg-[var(--app-bg-sunken)]">
        <summary className="tap-44 flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 text-[12.5px] font-semibold">
          <span className="inline-flex items-center gap-2">
            <ExternalLink className="h-4 w-4" strokeWidth={2} aria-hidden />
            How today&rsquo;s locations work
          </span>
          <ChevronDown className="h-4 w-4 transition-transform" strokeWidth={2} aria-hidden />
        </summary>
        <p className="border-t px-3.5 py-3 text-[12.5px] leading-relaxed" style={{ borderColor: "var(--app-border)", color: "var(--app-ink-2)" }}>
          Each location button opens the vendor&rsquo;s own latest social feed or website. Radius shows a live map pin only after that operator claims the listing and opts in.
        </p>
      </details>

      {FLAVOR_GROUPS.map((group) => {
        const trucks = FOOD_TRUCKS
          .filter((truck) => flavorFor(truck) === group.id)
          .sort((a, b) => Number(beaconByTruck.has(b.slug)) - Number(beaconByTruck.has(a.slug)));
        if (trucks.length === 0) return null;

        return (
          <section key={group.id} id={group.id} className="scroll-mt-28 space-y-3.5">
            <div className="flex items-end justify-between gap-4 border-b pb-3" style={{ borderColor: "var(--app-border)" }}>
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: FOOD_ACCENT }}>
                  Pick a craving
                </p>
                <h2 className="mt-1 font-serif text-[27px] leading-none tracking-tight" style={{ color: "var(--app-ink)" }}>
                  {group.title}
                </h2>
                <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--app-ink-2)" }}>{group.note}</p>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
                Swipe · {trucks.length}
              </span>
            </div>

            <ul className="shelf-rail shelf-grid-sm -mx-4 gap-3 px-4 pb-3 sm:mx-0 sm:grid-cols-2 sm:px-0">
              {trucks.map((truck) => (
                <TruckCard
                  key={truck.slug}
                  truck={truck}
                  number={FOOD_TRUCKS.indexOf(truck) + 1}
                  beacon={beaconByTruck.get(truck.slug)}
                />
              ))}
            </ul>
          </section>
        );
      })}

      <aside className="rounded-[var(--app-radius-lg)] border p-4 sm:flex sm:items-center sm:justify-between sm:gap-5" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}>
        <div>
          <p className="font-serif text-[21px]" style={{ color: "var(--app-ink)" }}>Is a truck missing?</p>
          <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            Send the basic details and location feed. You can also share an owner-approved photo. Every addition is checked before it appears here.
          </p>
        </div>
        <Link
          href="/submit/place?category=food-truck"
          className="tap-44 mt-3 inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-[12px] font-semibold sm:mt-0"
          style={{ background: "var(--app-ink)", color: "var(--app-bg)" }}
        >
          Add a missing truck
          <ArrowUpRight className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        </Link>
      </aside>
    </div>
  );
}
