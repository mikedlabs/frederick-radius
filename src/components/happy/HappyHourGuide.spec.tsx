// @vitest-environment jsdom
/* eslint-disable @next/next/no-img-element -- Native fixture image exposes real React load/error handlers. */
import { act, type ReactNode, type Ref } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HHRow } from "./HappyHourBrowser";

vi.mock("next/image", () => ({
  default: ({ src, alt, ref, onLoad, onError }: {
    src: string; alt: string; ref?: Ref<HTMLImageElement>;
    onLoad?: React.ReactEventHandler<HTMLImageElement>; onError?: React.ReactEventHandler<HTMLImageElement>;
  }) => <img ref={ref} src={src} alt={alt} onLoad={onLoad} onError={onError} />,
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => <a href={href} {...props}>{children}</a>,
}));
import HappyHourGuide from "./HappyHourGuide";
import HappyHourBrowser from "./HappyHourBrowser";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A synthetic venue that pours all day, every day, so it is the lead whenever
// the test runs. Neither the deal nor the photo is published evidence.
const PROXY = "/api/place-photo?name=places%2Ffixture-bar%2Fphotos%2Ffront&w=800&slug=fixture-bar";
function row(overrides: Partial<HHRow> = {}): HHRow {
  return {
    slug: "fixture-bar",
    name: "Fixture Oyster Bar",
    town: "Frederick City",
    photo: PROXY,
    deal: "$5 drafts, $1 oysters, half off wings",
    // The loader's shape: a label plus the flag that says the check is current.
    verified: "verified 3d ago",
    verifiedCurrent: true,
    schedule: "Daily, all day",
    windows: [{ days: [0, 1, 2, 3, 4, 5, 6], start: 0, end: 1440 }],
    ...overrides,
  };
}

describe("HappyHourGuide lead cover", () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
  afterEach(() => { act(() => root.unmount()); host.remove(); });

  const render = (rows: HHRow[]) => act(async () => root.render(<HappyHourGuide rows={rows} today={2} nowMin={17 * 60} checkWindowDays={60} />));
  const cover = () => host.querySelector<HTMLAnchorElement>("[data-happy-cover]")!;
  const load = async (width: number, height: number) => {
    const image = cover().querySelector("img")!;
    Object.defineProperty(image, "naturalWidth", { configurable: true, value: width });
    Object.defineProperty(image, "naturalHeight", { configurable: true, value: height });
    await act(async () => image.dispatchEvent(new Event("load")));
  };
  const expectTextCover = () => {
    expect(cover().dataset.happyCover).toBe("text");
    expect(cover().querySelector("img")).toBeNull();
    // No photo frame and no overlay: the cover is theme ink on the elevated surface.
    expect(cover().className).not.toContain("aspect-");
    expect(cover().style.background).toBe("var(--app-bg-elevated)");
    expect(cover().querySelector("h2")!.style.color).toBe("var(--app-ink)");
    expect(cover().innerHTML).not.toContain("gradient");
    // Deal figures use the text-role token, which lifts in dark appearance.
    expect(cover().querySelector<HTMLElement>("ul .font-mono")!.style.color).toBe("var(--app-accent-text)");
    // One name, the status, the town and every clause of the deal.
    expect(cover().textContent!.match(/Fixture Oyster Bar/g)).toHaveLength(1);
    expect(cover().textContent).toContain("On now · till close");
    expect(cover().textContent).toContain("Frederick City");
    expect(cover().textContent).toContain("$5 drafts");
    expect(cover().textContent).toContain("$1 oysters");
    expect(cover().getAttribute("href")).toBe("/places/fixture-bar");
  };

  it("asks the photo proxy for a detectable failure and keeps a real photograph", async () => {
    await render([row()]);
    const image = cover().querySelector("img")!;
    expect(new URL(image.src).searchParams.get("fallback")).toBe("signal");
    expect(cover().dataset.happyCover).toBe("photo");
    // The white cover text sits on a fixed dark ground until the photo paints,
    // in both appearances.
    expect(cover().style.background).toBe("var(--app-media-ink)");

    await load(800, 600);
    expect(cover().dataset.happyCover).toBe("photo");
    expect(cover().querySelector("img")).not.toBeNull();
    expect(cover().className).toContain("aspect-[16/9]");
  });

  it("replaces the proxy's 1px failure signal with the text cover", async () => {
    await render([row()]);
    await load(1, 1);
    expectTextCover();
  });

  it("replaces a broken photo with the text cover", async () => {
    await render([row()]);
    await act(async () => cover().querySelector("img")!.dispatchEvent(new Event("error")));
    expectTextCover();
  });

  it("catches a failure signal that finished loading before hydration", async () => {
    const complete = vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    try {
      // jsdom reports naturalWidth 0 for an image it never decoded, which is
      // what a cached 1px signal or a broken request looks like to the hook.
      await render([row()]);
      expectTextCover();
    } finally {
      complete.mockRestore();
    }
  });

  it("uses the text cover when the venue has no photo on file", async () => {
    await render([row({ photo: undefined })]);
    expectTextCover();
  });

  it("drops a failed row thumb to the icon tile in the week view", async () => {
    await render([row()]);
    await act(async () => host.querySelector<HTMLButtonElement>('[role="tab"]:not([aria-selected="true"])')!.click());
    const thumb = host.querySelector("article img")!;
    expect(new URL((thumb as HTMLImageElement).src).searchParams.get("w")).toBe("104");
    expect(new URL((thumb as HTMLImageElement).src).searchParams.get("fallback")).toBe("signal");
    Object.defineProperty(thumb, "naturalWidth", { configurable: true, value: 1 });
    Object.defineProperty(thumb, "naturalHeight", { configurable: true, value: 1 });
    await act(async () => thumb.dispatchEvent(new Event("load")));
    expect(host.querySelector("article img")).toBeNull();
    expect(host.querySelector("article svg")).not.toBeNull();
  });
});

describe("HappyHourGuide check strip", () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
  afterEach(() => { act(() => root.unmount()); host.remove(); });

  const current = (slug: string) => row({ slug, name: `Bar ${slug}`, verified: "verified 3d ago", verifiedCurrent: true });
  const stale = (slug: string, month = "Jun 2026") => row({ slug, name: `Bar ${slug}`, verified: `last checked ${month}`, verifiedCurrent: false });
  const undated = (slug: string) => row({ slug, name: `Bar ${slug}`, verified: null, verifiedCurrent: false });
  const strip = async (rows: HHRow[], checkWindowDays = 60) => {
    await act(async () => root.render(<HappyHourGuide rows={rows} today={2} nowMin={17 * 60} checkWindowDays={checkWindowDays} />));
    return host.querySelector<HTMLElement>("[data-happy-check-strip]")!.textContent!;
  };

  it("says verified at source only when every check is current", async () => {
    const text = await strip([current("a"), current("b")]);
    expect(text).toContain("2 verified");
    expect(text).toContain("at source");
    expect(host.querySelector("[data-happy-check-age]")).toBeNull();
  });

  it("prints the shared month when every check is older and dated alike", async () => {
    const text = await strip([stale("a"), stale("b")]);
    expect(text).toContain("2 listed");
    expect(text).toContain("last checked Jun 2026");
    expect(text).not.toMatch(/verified|at source/);
  });

  it("counts the current checks when only some are current", async () => {
    // (a) The state the page reaches as soon as one venue is re-checked.
    let text = await strip([current("a"), stale("b")]);
    expect(text).toContain("2 listed");
    expect(text).toContain("1 of 2 checked in the last 60 days");
    expect(text).not.toMatch(/verified|at source|last checked/);
    // (b) Stale checks from different months.
    text = await strip([current("a"), stale("b"), stale("c", "May 2026")]);
    expect(text).toContain("1 of 3 checked in the last 60 days");
    // (c) An undated row beside a current one is not called old.
    text = await strip([undated("a"), current("b")]);
    expect(text).toContain("1 of 2 checked in the last 60 days");
    expect(text).not.toContain("older");
  });

  it("never gives an undated row a check date", async () => {
    // (d) No row has a recorded check.
    let text = await strip([undated("a"), undated("b")]);
    expect(text).toContain("check dates not recorded");
    expect(text).not.toMatch(/older|last checked|verified/);
    // A June row beside an undated row: the June label would cover both.
    text = await strip([stale("a"), undated("b")]);
    expect(text).toContain("none checked in the last 60 days");
    expect(text).not.toContain("last checked Jun 2026");
    // Older rows from different months share no one label.
    text = await strip([stale("a"), stale("b", "May 2026")]);
    expect(text).toContain("none checked in the last 60 days");
  });

  it("follows the check window it is given", async () => {
    expect(await strip([current("a"), stale("b")], 90)).toContain("1 of 2 checked in the last 90 days");
  });
});

describe("HappyHourBrowser verified badge", () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
  afterEach(() => { act(() => root.unmount()); host.remove(); });

  it("draws the at-source badge only on a row whose check is current", async () => {
    // Tuesday 8 to 10 PM, read at 5 PM: listed for today, not on now.
    const evening = [{ days: [2], start: 20 * 60, end: 22 * 60 }];
    const rows = [
      row({ slug: "fresh", name: "Fresh Bar", windows: evening, verified: "verified 3d ago", verifiedCurrent: true }),
      row({ slug: "june", name: "June Bar", windows: evening, verified: "last checked Jun 2026", verifiedCurrent: false }),
      // A label without the flag is not a current check.
      row({ slug: "bare", name: "Bare Bar", windows: evening, verified: "verified 3d ago", verifiedCurrent: undefined }),
    ];
    await act(async () => root.render(<HappyHourBrowser rows={rows} today={2} nowMin={17 * 60} />));
    const badges = host.querySelectorAll('[aria-label="verified at the source"]');
    expect(badges).toHaveLength(1);
    expect(badges[0].closest("article")!.textContent).toContain("Fresh Bar");
  });

  it("tells an empty day plainly without calling the other days verified", async () => {
    const rows = [row({ windows: [{ days: [5], start: 16 * 60, end: 18 * 60 }] })];
    await act(async () => root.render(<HappyHourBrowser rows={rows} today={2} nowMin={17 * 60} />));
    expect(host.textContent).toContain("No happy hours are listed for Tuesday yet. Try another day.");
    expect(host.textContent).not.toMatch(/verified/i);
  });
});
