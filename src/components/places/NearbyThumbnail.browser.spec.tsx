// @vitest-environment jsdom
/* eslint-disable @next/next/no-img-element -- Native image state exposes cached failure and load events. */
import { act, type ComponentProps } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ nearby: vi.fn() }));
vi.mock("next/image", () => ({ default: ({ alt, ...props }: ComponentProps<"img">) => <img {...props} alt={alt ?? ""} /> }));
vi.mock("@/lib/integrations/wikiContext", () => ({ getNearbyWikipedia: mocks.nearby }));
import NearbyThumbnail from "./NearbyThumbnail";
import NearbyContext from "./NearbyContext";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const src = "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/35/John_Hanson_House_MD1.jpg/250px-John_Hanson_House_MD1.jpg";
const sourceUrl = "https://en.wikipedia.org/wiki/Hanson-Thomas_Houses";
const context = () => NearbyContext({ lat: 39.414, lng: -77.41 });

describe("nearby context photo failure", () => {
  let root: Root | undefined;
  let host: HTMLDivElement;
  beforeEach(() => {
    vi.clearAllMocks();
    root = undefined;
    host = document.createElement("div");
    document.body.append(host);
    mocks.nearby.mockResolvedValue([{ pageId: 1, title: "Hanson-Thomas Houses", url: sourceUrl,
      thumbnail: src, distanceM: 128, extract: "Two adjoining historic homes in Frederick." }]);
  });
  afterEach(() => {
    if (root) act(() => root?.unmount());
    host.remove();
    vi.restoreAllMocks();
  });
  const render = async (element: React.ReactNode) => act(async () => {
    root ??= createRoot(host);
    root.render(element);
  });
  const expectUsefulContext = () => {
    expect(host.querySelector(`a[href="${sourceUrl}"]`)?.textContent).toBe("Hanson-Thomas Houses");
    expect(host.textContent).toContain("Two adjoining historic homes in Frederick.");
    expect(host.textContent).toContain("420 ft");
    expect(host.textContent).toContain("Context source: Wikipedia (CC BY-SA)");
  };

  it("renders the real linked context and decorative photo in the server preview", async () => {
    host.innerHTML = renderToString(await context());
    const image = host.querySelector("img")!;
    expect(image.getAttribute("src")).toBe(src);
    expect(image.alt).toBe("");
    expect(image.width).toBe(56);
    expect(image.height).toBe(56);
    expect(host.querySelector("[data-nearby-thumbnail-failed]")).toBeNull();
    expectUsefulContext();
  });

  it("removes a failed photo without leaving a reserved image slot or losing the source-linked context", async () => {
    await render(await context());
    await act(async () => host.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(host.querySelector("img")).toBeNull();
    const marker = host.querySelector<HTMLElement>("[data-nearby-thumbnail-failed]")!;
    expect(marker.hidden).toBe(true);
    expect(marker.getAttribute("data-nearby-thumbnail-failed")).toBe(src);
    expect(marker.className).toBe("");
    expectUsefulContext();
  });

  it.each([0, 250])("reconciles a photo completed before hydration with naturalWidth %s", async (naturalWidth) => {
    const preview = await context();
    host.innerHTML = renderToString(preview);
    const image = host.querySelector("img")!;
    Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: naturalWidth } });
    await act(async () => { root = hydrateRoot(host, preview); });
    expect(host.querySelector("img") === null).toBe(naturalWidth === 0);
    expect(Boolean(host.querySelector("[data-nearby-thumbnail-failed]"))).toBe(naturalWidth === 0);
    expectUsefulContext();
  });

  it("keeps an incomplete photo while it loads instead of treating its zero width as a failure", async () => {
    const preview = <NearbyThumbnail src={src} />;
    host.innerHTML = renderToString(preview);
    const image = host.querySelector("img")!;
    Object.defineProperties(image, { complete: { value: false }, naturalWidth: { value: 0 } });
    await act(async () => { root = hydrateRoot(host, preview); });
    expect(host.querySelector("img")).toBe(image);
    expect(host.querySelector("[data-nearby-thumbnail-failed]")).toBeNull();
  });

  it("allows a changed photo source to load after the previous source failed", async () => {
    await render(<NearbyThumbnail src={src} />);
    await act(async () => host.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(host.querySelector("img")).toBeNull();
    const next = "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Other.jpg/250px-Other.jpg";
    await render(<NearbyThumbnail src={next} />);
    expect(host.querySelector("img")?.getAttribute("src")).toBe(next);
    expect(host.querySelector("[data-nearby-thumbnail-failed]")).toBeNull();
  });
});
