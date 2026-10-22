import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import SearchOverlay from "./SearchOverlay";
import { usePushRecentSearch } from "@/hooks/useRecentSearches";
import { freeSearchPlaceVisual } from "@/lib/search/place-visual";
import type { QualifiedSearchIndexResult } from "@/lib/search/index";

/** Query-only parent state matches the overlay's real lazy-mount contract.
 * Full header/session/history behavior is covered by the interactive specs. */
function FindWorkshop({ initialQuery = "coffee", sampleRecentQuery }: { initialQuery?: string; sampleRecentQuery?: string }) {
  const pushRecent = usePushRecentSearch();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(initialQuery);
  const openerRef = useRef<HTMLElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <main className="mx-auto max-w-screen-sm space-y-4 p-4">
        <h1 className="text-2xl font-semibold">Find continuity workshop</h1>
        <p className="text-[15px] leading-relaxed">
          This preview uses sample search responses for component review. It does
          not show current places, hours, or source checks.
        </p>
        <Button onClick={(event) => {
          openerRef.current = event.currentTarget;
          if (sampleRecentQuery) pushRecent(sampleRecentQuery);
          setOpen(true);
        }}>
          {sampleRecentQuery ? "Submit sample recent search" : "Open sample Find"}
        </Button>
      </main>
      {open && (
        <SearchOverlay
          open
          initialQuery={draft}
          onQueryChange={setDraft}
          onClose={close}
          openerRef={openerRef}
          // The workshop must not add entries to Storybook's own route history.
          historyLayerId=""
        />
      )}
    </>
  );
}

function sampleSearch(state: "ready" | "loading" | "error", readyResponse?: QualifiedSearchIndexResult) {
  const originalFetch = window.fetch;
  const cancelPending = new Set<() => void>();
  let reads = 0;
  const fixtureFetch: typeof fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    if (url.origin !== window.location.origin || url.pathname !== "/api/search") {
      return originalFetch.call(window, input, init);
    }
    reads += 1;
    if (state === "loading") {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
        const cancel = () => {
          cancelPending.delete(cancel);
          signal?.removeEventListener("abort", cancel);
          reject(new DOMException("Sample request cancelled", "AbortError"));
        };
        cancelPending.add(cancel);
        signal?.addEventListener("abort", cancel, { once: true });
        if (signal?.aborted) cancel();
      });
    }
    if (state === "error") return Promise.resolve(new Response("Sample service unavailable", { status: 503 }));
    return Promise.resolve(Response.json(readyResponse ?? {
      results: [{
        type: "place",
        id: "sample-coffee",
        title: "Sample coffee match",
        subtitle: `This is sample response ${reads} for component review.`,
        href: "/search?q=coffee",
      }],
    }));
  };
  window.fetch = fixtureFetch;
  return () => {
    if (window.fetch === fixtureFetch) window.fetch = originalFetch;
    for (const cancel of cancelPending) cancel();
  };
}

const MUSEUM_NAME = "National Museum of Civil War Medicine";
const MUSEUM_SLUG = "national-museum-civil-war-medicine-frederick";

/** A labeled response fixture reuses only the already reviewed local image.
 * No live search, place status, provider, or hours observation is simulated. */
function sampleMuseumResponse(): QualifiedSearchIndexResult {
  const source = freeSearchPlaceVisual({ slug: MUSEUM_SLUG });
  if (source?.kind !== "curated") throw new Error("The sample requires the existing licensed museum image.");
  return {
    results: [{
      type: "place",
      id: `place:${MUSEUM_SLUG}`,
      title: MUSEUM_NAME,
      subtitle: "Sample result for component review · Frederick City",
      href: `/places/${MUSEUM_SLUG}`,
      thumbnailSource: source,
      // Existing catalog point permits review of the real Map action.
      lat: 39.4139408,
      lng: -77.4092991,
      trust: { level: "unconfirmed", label: "Sample hours not confirmed", basis: "This component fixture does not check current hours." },
    }],
    meta: {
      qualifiers: {
        namedPlaceSlug: null,
        compoundIntent: null,
        strictPlaceKind: null,
        categoryKey: null,
        categoryLabel: null,
        openNow: false,
        nearMe: false,
        downtown: false,
        regions: [],
        requestedFeatures: [],
        negatedFeatures: [],
        cleanedQuery: MUSEUM_NAME.toLowerCase(),
        includeAllCategoryMatches: false,
        constrained: false,
      },
      contextLabel: "Whole county",
      nearMeApplied: false,
      fallbackReason: null,
      scopeMunicipality: null,
    },
  };
}

/** Scoped storage failures for the workshop, restored after each story. */
function sampleHistoryFailure(state: "unavailable" | "clear-failed") {
  const key = "fr:recent-search:v2";
  const storage = window.localStorage;
  const previous = storage.getItem(key);
  storage.removeItem(key);
  const originalRead = Storage.prototype.getItem;
  const originalWrite = Storage.prototype.setItem;
  const fixtureRead: typeof originalRead = function (this: Storage, name) {
    if (this === storage && name === key && state === "unavailable") {
      throw new DOMException("Sample history unavailable", "SecurityError");
    }
    return originalRead.call(this, name);
  };
  const fixtureWrite: typeof originalWrite = function (this: Storage, name, value) {
    if (this === storage && name === key && state === "clear-failed" && JSON.parse(value).queries?.length === 0) {
      throw new DOMException("Sample Clear refused", "QuotaExceededError");
    }
    originalWrite.call(this, name, value);
  };
  Storage.prototype.getItem = fixtureRead;
  Storage.prototype.setItem = fixtureWrite;
  return () => {
    if (Storage.prototype.getItem === fixtureRead) Storage.prototype.getItem = originalRead;
    if (Storage.prototype.setItem === fixtureWrite) Storage.prototype.setItem = originalWrite;
    if (previous === null) storage.removeItem(key);
    else storage.setItem(key, previous);
  };
}

const meta = {
  title: "Radius UI/Find continuity",
  component: FindWorkshop,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: "Find restores only the draft words. These clearly labeled sample responses show a fresh read, loading and failure. Provider data and stored result snapshots are not used.",
      },
    },
  },
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
} satisfies Meta<typeof FindWorkshop>;
export default meta;
type Story = StoryObj<typeof meta>;

export const NoSubmittedSearches: Story = {
  args: { initialQuery: "" },
  beforeEach: () => {
    const restoreFetch = sampleSearch("ready");
    const keys = ["fr:recent-search:v1", "fr:recent-search:v2"];
    const previous = keys.map((key) => window.localStorage.getItem(key));
    // This legacy fixture deliberately has no real submission provenance.
    window.localStorage.setItem(keys[0], JSON.stringify(["Sample legacy query"]));
    window.localStorage.removeItem(keys[1]);
    return () => {
      restoreFetch();
      keys.forEach((key, index) => {
        if (previous[index] === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, previous[index]!);
      });
    };
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Open sample Find" }));
    const dialog = within(await canvas.findByRole("dialog", { name: "What do you need?" }));
    const recents = within(dialog.getByRole("region", { name: "Recent searches on this device" }));
    await expect(recents.getByText("No recent searches on this device.")).toBeVisible();
    await expect(recents.queryByRole("button")).not.toBeInTheDocument();
    await expect(dialog.queryByText("Sample legacy query")).not.toBeInTheDocument();
    await userEvent.type(dialog.getByRole("searchbox"), "Sample typed draft");
    await userEvent.click(dialog.getByRole("button", { name: "Clear search" }));
    await expect(within(dialog.getByRole("region", { name: "Recent searches on this device" }))
      .getByText("No recent searches on this device.")).toBeVisible();
    await expect(window.localStorage.getItem("fr:recent-search:v2")).toBeNull();
  },
};

export const UnavailableRecentSearches: Story = {
  args: { initialQuery: "" },
  beforeEach: () => {
    const restoreFetch = sampleSearch("ready");
    const restoreHistory = sampleHistoryFailure("unavailable");
    return () => { restoreHistory(); restoreFetch(); };
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Open sample Find" }));
    const dialog = within(await canvas.findByRole("dialog", { name: "What do you need?" }));
    const recents = within(dialog.getByRole("region", { name: "Recent searches on this device" }));
    await expect(recents.getByText("Recent searches are unavailable on this device.")).toBeVisible();
    await expect(recents.queryByText("No recent searches on this device.")).not.toBeInTheDocument();
    await expect(recents.queryByRole("button")).not.toBeInTheDocument();
  },
};

export const ClearRecentSearchesFailure: Story = {
  args: { initialQuery: "", sampleRecentQuery: "Sample submitted phrase" },
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  parameters: { docs: { description: { story: "Submitting this labeled sample records its phrase through the real submission hook. Clear is deliberately refused to demonstrate truthful failure feedback." } } },
  beforeEach: () => {
    const restoreFetch = sampleSearch("ready");
    const restoreHistory = sampleHistoryFailure("clear-failed");
    return () => { restoreHistory(); restoreFetch(); };
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Submit sample recent search" }));
    const dialog = within(await canvas.findByRole("dialog", { name: "What do you need?" }));
    const recents = within(dialog.getByRole("region", { name: "Recent searches on this device" }));
    const repeatSearch = recents.getByRole("button", { name: "Sample submitted phrase" });
    repeatSearch.scrollIntoView({ block: "nearest" });
    const box = repeatSearch.getBoundingClientRect();
    await expect(box.width).toBeGreaterThanOrEqual(44);
    await expect(box.height).toBeGreaterThanOrEqual(44);
    for (const offset of [-21.5, 0, 21.5]) {
      const hit = repeatSearch.ownerDocument.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2 + offset);
      await expect(hit !== null && repeatSearch.contains(hit)).toBe(true);
    }
    repeatSearch.focus();
    await userEvent.keyboard("{Enter}");
    await expect(dialog.getByRole("searchbox")).toHaveValue("Sample submitted phrase");
    await expect(canvas.getByRole("dialog", { name: "What do you need?" })).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Clear search" }));
    await expect(dialog.getByRole("searchbox")).toHaveValue("");
    // Choosing a query unmounts the empty-query section. Probe the newly
    // rendered history region after Clear, not its detached predecessor.
    const currentRecents = within(dialog.getByRole("region", { name: "Recent searches on this device" }));
    await userEvent.click(currentRecents.getByRole("button", { name: "Clear recent searches" }));
    await expect(currentRecents.getByText("Could not clear recent searches. Please try again.")).toBeVisible();
    await expect(currentRecents.getByRole("button", { name: "Sample submitted phrase" })).toBeVisible();
    await expect(currentRecents.queryByText("No recent searches on this device.")).not.toBeInTheDocument();
  },
};

export const RestoredQuery: Story = {
  beforeEach: () => sampleSearch("ready"),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const opener = canvas.getByRole("button", { name: "Open sample Find" });
    await userEvent.click(opener);
    let dialog = within(await canvas.findByRole("dialog", { name: "What do you need?" }));
    await expect(dialog.getByRole("searchbox")).toHaveValue("coffee");
    await expect(await dialog.findByText("This is sample response 1 for component review.")).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Close Find" }));
    await expect(canvas.queryByRole("dialog")).not.toBeInTheDocument();
    await expect(opener).toHaveFocus();
    await userEvent.click(opener);
    dialog = within(await canvas.findByRole("dialog", { name: "What do you need?" }));
    await expect(dialog.getByRole("searchbox")).toHaveValue("coffee");
    await expect(await dialog.findByText("This is sample response 2 for component review.")).toBeVisible();
    await expect(dialog.queryByText("This is sample response 1 for component review.")).not.toBeInTheDocument();
  },
};

export const LoadingRestoredQuery: Story = {
  beforeEach: () => sampleSearch("loading"),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Open sample Find" }));
    const dialog = within(await canvas.findByRole("dialog", { name: "What do you need?" }));
    await expect(dialog.getByRole("searchbox")).toHaveValue("coffee");
    await expect(dialog.getByText("Searching…", { exact: true })).toBeVisible();
  },
};

export const UnavailableRestoredQuery: Story = {
  beforeEach: () => sampleSearch("error"),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Open sample Find" }));
    const dialog = within(await canvas.findByRole("dialog", { name: "What do you need?" }));
    await expect(dialog.getByRole("searchbox")).toHaveValue("coffee");
    await expect(await dialog.findByText("Search is unavailable right now.")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Try again" })).toBeEnabled();
  },
};

const exactMuseumFirst: NonNullable<Story["play"]> = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole("button", { name: "Open sample Find" }));
  const dialogElement = await canvas.findByRole("dialog", { name: "What do you need?" });
  const dialog = within(dialogElement);
  const heading = await dialog.findByRole("heading", { name: MUSEUM_NAME });
  await expect(dialog.getByRole("searchbox")).toHaveValue(MUSEUM_NAME);
  await expect(dialog.getByText("Sample result for component review · Frederick City")).toBeVisible();
  await expect(dialog.queryByText("Direct answer", { exact: true })).not.toBeInTheDocument();
  await expect(dialog.queryByText("Art", { exact: true })).not.toBeInTheDocument();
  await expect(dialog.queryByText(/Art\s*·\s*Whole county/)).not.toBeInTheDocument();

  const results = dialog.getByRole("list", { name: "Search results" });
  await expect(results.firstElementChild).toContainElement(heading);
  await expect(results.children).toHaveLength(1);
  const lead = heading.closest("[data-search-place-lead]")!;
  const image = lead.querySelector<HTMLImageElement>("[data-search-place-photo-frame='lead'] img");
  if (!image) throw new Error("The exact place must lead with its existing local photograph.");
  const source = freeSearchPlaceVisual({ slug: MUSEUM_SLUG });
  if (source?.kind !== "curated") throw new Error("The story requires the reviewed licensed local image.");
  await waitFor(async () => {
    await image.decode();
    expect(image.naturalWidth).toBeGreaterThan(1);
    expect(image.naturalHeight).toBeGreaterThan(1);
  }, { timeout: 5000 });
  const imageUrl = new URL(image.currentSrc, window.location.href);
  await expect(imageUrl.pathname === source.src || imageUrl.searchParams.get("url") === source.src).toBe(true);
  await expect(getComputedStyle(image).objectPosition).toBe("50% 100%");
  await expect(image.parentElement!.getBoundingClientRect().bottom).toBeLessThanOrEqual(heading.getBoundingClientRect().top);

  const attribution = await dialog.findByRole("link", { name: /Wikimedia Commons/ });
  const credit = attribution.closest<HTMLElement>(".place-card-photo-credit")!;
  await expect(credit).toHaveTextContent(source.photo.author);
  await expect(attribution).toBeVisible();
  await expect(attribution).toHaveAttribute("href", source.photo.source_url);
  const license = dialog.getByRole("link", { name: source.photo.license });
  await expect(license).toBeVisible();
  await expect(license).toHaveAttribute("href", source.photo.licenseUrl);
  const viewPlace = dialog.getByRole("link", { name: "View place" });
  const map = dialog.getByRole("link", { name: /^Map$/ });
  await expect(viewPlace).toHaveAttribute("href", `/places/${MUSEUM_SLUG}`);
  await expect(map).toHaveAttribute("href", expect.stringContaining(`place=${MUSEUM_SLUG}`));
  for (const control of [viewPlace, map, attribution, license]) {
    control.scrollIntoView({ block: "nearest" });
    const bounds = control.getBoundingClientRect();
    await expect(bounds.width).toBeGreaterThanOrEqual(44);
    await expect(bounds.height).toBeGreaterThanOrEqual(44);
  }
  // Close uses the shared invisible hit extender. Verify real hit testing,
  // rather than mistaking its smaller visual label for its effective target.
  const close = dialog.getByRole("button", { name: "Close Find" });
  close.scrollIntoView({ block: "nearest" });
  const closeBox = close.getBoundingClientRect();
  for (const [dx, dy] of [[-21.5, -21.5], [-21.5, 21.5], [21.5, -21.5], [21.5, 21.5]]) {
    const hit = close.ownerDocument.elementFromPoint(closeBox.x + closeBox.width / 2 + dx, closeBox.y + closeBox.height / 2 + dy);
    await expect(hit !== null && close.contains(hit)).toBe(true);
  }
  await expect(dialogElement.querySelector("a a")).toBeNull();
  for (const element of [dialogElement, results, heading.closest("li")!]) {
    await expect(element.scrollWidth).toBeLessThanOrEqual(element.clientWidth);
  }
  // Enter uses native navigation and is proved in the dedicated browser flow,
  // so the workshop retains its own document for mobile visual review.
  image.scrollIntoView({ block: "nearest" });
};

const museumStory: Story = {
  args: { initialQuery: MUSEUM_NAME },
  beforeEach: () => sampleSearch("ready", sampleMuseumResponse()),
  parameters: { docs: { description: { story: "A labeled sample search response with the existing licensed museum photo. The mounted Find surface keeps the exact place above category shortcuts, retains creator/source/license links and uses native-size actions. It does not verify current hours or make a provider request." } } },
  play: exactMuseumFirst,
};

export const ExactMuseum320: Story = {
  ...museumStory,
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
};
export const ExactMuseum375: Story = {
  ...museumStory,
  globals: { viewport: { value: "radiusMobileCompact", isRotated: false } },
};
export const ExactMuseum390: Story = {
  ...museumStory,
  globals: { viewport: { value: "radiusMobile", isRotated: false } },
};
export const ExactMuseum430: Story = {
  ...museumStory,
  globals: { viewport: { value: "radiusMobileLarge", isRotated: false } },
};

export const PendingExactPlaceKeepsTransitImmediate: Story = {
  args: { initialQuery: MUSEUM_NAME },
  beforeEach: () => sampleSearch("loading"),
  parameters: { docs: { description: { story: "The sample search request stays pending. No guessed Art shortcut appears for the museum; replacing the draft with buses still exposes the deterministic transit answer immediately." } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Open sample Find" }));
    const dialog = within(await canvas.findByRole("dialog", { name: "What do you need?" }));
    await expect(dialog.getByRole("searchbox")).toHaveValue(MUSEUM_NAME);
    await expect(dialog.getByText("Searching…", { exact: true })).toBeVisible();
    await expect(dialog.queryByText("Direct answer", { exact: true })).not.toBeInTheDocument();
    await expect(dialog.queryByText("Art", { exact: true })).not.toBeInTheDocument();
    await expect(dialog.queryByRole("link", { name: "View place" })).not.toBeInTheDocument();
    const input = dialog.getByRole("searchbox");
    await userEvent.clear(input);
    await userEvent.type(input, "buses");
    await expect(await dialog.findByRole("link", { name: /MARC & transit times/ })).toHaveAttribute("href", "/transit");
    await expect(dialog.getByText("Searching…", { exact: true })).toBeVisible();
    await expect(dialog.queryByRole("heading", { name: MUSEUM_NAME })).not.toBeInTheDocument();
    await expect(dialog.queryByText("Art", { exact: true })).not.toBeInTheDocument();
  },
};
