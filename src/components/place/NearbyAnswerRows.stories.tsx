import { useLayoutEffect, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import type { PlaceCardData } from "@/lib/loaders/places";
import { contrastRatio } from "@/lib/color/brandHue";
import PlaceCard from "./PlaceCard";

/**
 * Nearby's answer rows (`PlaceCard variant="row" hoursInMeta`), from the
 * November 11, 2026 hierarchy audit: ruled rows on the page ground, the town
 * and "Hours not confirmed" folded into the muted line, and a status line
 * only for hours Radius can state, so a confirmed-open place is marked.
 */
const base: PlaceCardData = {
  slug: "nearby-answer-open", name: "Example Tap House and Kitchen on the Creek",
  category: "restaurant", tags: [], city: "Frederick", municipality: "frederick",
  open_status: { state: "open", closesAt: "22:00", closingSoon: false },
  short_blurb: "", state: "MD", postal_code: "21701", is_verified: true,
  feature_score: 6, source: "manual", updated_at: "2026-09-01",
  source_id: "component-workshop:nearby-answer", source_url: null,
  license: "Demonstration fixture", confidence: "curated",
  first_seen_at: "2026-09-01T12:00:00Z", last_verified_at: "2026-09-01T12:00:00Z",
  address: "100 Example St, Frederick, MD", geom: { lng: -77.4105, lat: 39.4143 },
  distance_m: 140, field_notes: true, google_rating: 4.6, google_rating_count: 320,
};
const unknown: PlaceCardData = {
  ...base, slug: "nearby-answer-unknown", name: "Example Diner",
  open_status: { state: "unknown" }, distance_m: 610, field_notes: false,
};
const closed: PlaceCardData = {
  ...base, slug: "nearby-answer-closed", name: "Example Bakery", category: "bakery",
  open_status: { state: "closed" }, distance_m: 900, google_rating: undefined, google_rating_count: undefined,
};

function NearbyRows() {
  return <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
    {[base, unknown, closed].map((place) => <li key={place.slug} data-row={place.slug}>
      <PlaceCard place={place} variant="row" hoursInMeta />
    </li>)}
  </ul>;
}

function DarkAppearance({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-appearance");
    root.setAttribute("data-appearance", "dark");
    return () => { if (previous === null) root.removeAttribute("data-appearance"); else root.setAttribute("data-appearance", previous); };
  }, []);
  return <>{children}</>;
}

const meta = {
  title: "Places/Nearby answer rows", component: NearbyRows, tags: ["autodocs"],
  parameters: { layout: "padded", a11y: { test: "error" } },
  decorators: [(Story) => <div style={{ width: 288, maxWidth: "calc(100vw - 32px)", background: "var(--app-bg)" }}><Story /></div>],
} satisfies Meta<typeof NearbyRows>;
export default meta;
type Story = StoryObj<typeof meta>;

function rgb(color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return { r, g, b };
}

async function answerRows(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const row = (slug: string) => canvasElement.querySelector<HTMLElement>(`[data-row="${slug}"] article`)!;
  // Unknown hours live in the muted meta line, once, and add no status line.
  await expect(canvas.getAllByText("Hours not confirmed")).toHaveLength(1);
  await expect(row(unknown.slug).querySelector("[data-place-row-meta] [data-place-row-hours-unknown]")).not.toBeNull();
  // Known hours keep a status line: open is marked, and so is a closure.
  const open = within(row(base.slug)).getByText(/^Open until/);
  await expect(open).toBeVisible();
  await expect(within(row(closed.slug)).getByText(/^Closed/)).toBeVisible();
  // Distance leads the meta line; the title keeps the row's width.
  await expect(row(base.slug).querySelector("[data-place-row-meta] [data-place-distance]")?.textContent).toBe("459 ft");
  // No per-row filled action, reason labels or field-notes tag.
  await expect(canvasElement.querySelectorAll('a[aria-label^="Directions"]')).toHaveLength(0);
  await expect(canvasElement.querySelectorAll("[data-place-reason-label], [data-field-note-tag]")).toHaveLength(0);
  // Plain rows: no card fill, border radius or shadow on the article.
  for (const article of canvasElement.querySelectorAll<HTMLElement>("article")) {
    const style = getComputedStyle(article);
    await expect(style.boxShadow).toBe("none");
    await expect(style.borderTopLeftRadius).toBe("0px");
    await expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  }
  // The open label stays readable on the page ground in either appearance.
  const probe = document.createElement("span");
  probe.style.background = "var(--app-bg)";
  canvasElement.append(probe);
  const ratio = contrastRatio(rgb(getComputedStyle(open).color), rgb(getComputedStyle(probe).backgroundColor));
  probe.remove();
  await expect(ratio).toBeGreaterThanOrEqual(4.5);
  await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth + 1);
}

export const NarrowPhone: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  play: ({ canvasElement }) => answerRows(canvasElement),
};

export const NarrowPhoneDark: Story = {
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  decorators: [(Story) => <DarkAppearance><Story /></DarkAppearance>],
  play: ({ canvasElement }) => answerRows(canvasElement),
};
