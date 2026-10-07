import Link from "next/link";
import type { TownStat } from "@/lib/guided/town-stats";
import { getTownPhoto, wikimediaUrl } from "@/lib/integrations/wikimedia";
import {
  PlacePhotoScope,
  PlacePhotoScopeImage,
  PlacePhotoWhen,
} from "@/components/place/PlacePhotoState";
import { OVERVIEW_VIEW_HEIGHT, OVERVIEW_VIEW_WIDTH } from "@/components/map/countyOverview";

/** A town drawn on the small county tile of its card. */
export type TownLocator = {
  /** Town center in overlay view units (projectOverview). */
  x: number;
  y: number;
  /** The town's own boundary path, or null when there is no official one. */
  path: string | null;
};

/** One short line per card: what the town holds, never a sentence fragment. */
export function townCardLine(t: Pick<TownStat, "placeCount" | "eventCount">): string {
  const places = `${t.placeCount} ${t.placeCount === 1 ? "place" : "places"}`;
  if (t.eventCount <= 0) return places;
  return `${places} · ${t.eventCount} ${t.eventCount === 1 ? "event" : "events"}`;
}

/**
 * The town on the county map: the county outline, the town's own boundary
 * when the County publishes one, and a Brick point at its center so even the
 * smallest town reads at card size. It is real geography, so it is the
 * honest picture for a town with no verified photo.
 */
function TownTile({ locator, outline }: { locator: TownLocator; outline: string }) {
  return (
    <svg
      aria-hidden="true"
      data-town-tile=""
      viewBox={`0 0 ${OVERVIEW_VIEW_WIDTH} ${OVERVIEW_VIEW_HEIGHT}`}
      className="absolute inset-0 h-full w-full"
    >
      <path
        d={outline}
        strokeWidth={1.25}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        className="fill-[color:var(--app-bg)] stroke-[color:var(--app-ink-3)]"
      />
      {locator.path ? (
        <path
          d={locator.path}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          className="fill-[color:var(--app-brand-tint-22)] stroke-[color:var(--app-brand)]"
        />
      ) : null}
      <circle
        cx={locator.x}
        cy={locator.y}
        r={40}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        className="fill-[color:var(--app-brand)] stroke-[color:var(--app-bg)]"
      />
    </svg>
  );
}

/**
 * The town picker: a grid of picture cards. Seven towns have a verified
 * Wikimedia photo of the town itself (TOWN_PHOTOS), credited under the card
 * only once it has loaded, the same way event cards credit theirs. The other
 * six, and any town whose photo fails, show the town on the county map
 * instead, never a neighboring town's photo. Each card carries the name and
 * one short line of real counts. Server component; the photo state is the
 * only client boundary.
 */
export default function TownPicker({
  stats,
  locators,
  tileOutline,
}: {
  stats: TownStat[];
  locators: Record<string, TownLocator>;
  tileOutline: string;
}) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {stats.map((t) => {
        const photo = getTownPhoto(t.slug);
        const locator = locators[t.slug];
        const tile = locator ? <TownTile locator={locator} outline={tileOutline} /> : null;
        const card = (
          <Link
            href={`/m/${t.slug}`}
            data-town-card={t.slug}
            className="block flex-1 overflow-hidden rounded-[var(--app-radius-lg)] border border-[color:var(--app-border)] bg-[color:var(--app-bg-elevated-solid)]"
          >
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-[color:var(--app-bg-sunken)]">
              {photo ? (
                <>
                  <PlacePhotoScopeImage
                    alt=""
                    fill
                    sizes="(max-width: 640px) 50vw, 240px"
                    className="object-cover"
                  />
                  <PlacePhotoWhen is="missing">{tile}</PlacePhotoWhen>
                </>
              ) : (
                tile
              )}
            </div>
            <div className="px-3 py-2.5">
              <h2 className="text-title-sm text-[color:var(--app-ink)]">{t.name}</h2>
              <p className="mt-0.5 text-meta text-[color:var(--app-ink-3)]">{townCardLine(t)}</p>
            </div>
          </Link>
        );
        return (
          <li key={t.slug} className="flex flex-col">
            {photo ? (
              <PlacePhotoScope src={wikimediaUrl(photo.file, 1200)}>
                {card}
                <PlacePhotoWhen is="ready">
                  <p
                    data-town-photo-credit=""
                    className="mt-0.5 px-1 text-caption text-[color:var(--app-ink-3)]"
                  >
                    Photo:{" "}
                    <a
                      href={photo.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tap-44-y inline-flex min-h-6 items-center underline underline-offset-2"
                    >
                      {photo.author}
                    </a>{" "}
                    · {photo.license}
                  </p>
                </PlacePhotoWhen>
              </PlacePhotoScope>
            ) : (
              card
            )}
          </li>
        );
      })}
    </ul>
  );
}
