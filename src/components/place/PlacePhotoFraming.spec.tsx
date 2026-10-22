// @vitest-environment jsdom
/* eslint-disable @next/next/no-img-element -- Native images expose the real component load/error handlers without image requests. */
import { act, useState, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Link from "next/link";

vi.mock("next/image", () => ({
  default: ({ src, alt, style, onLoad, onError, className, sizes }: ComponentProps<"img">) => {
    if (typeof src !== "string") throw new Error("The framing fixture requires a string image source.");
    return <img src={src} alt={alt} style={style} onLoad={onLoad} onError={onError}
      className={className} sizes={sizes} />;
  },
}));

import PlaceCardPhoto, { PlaceCardPhotoCredit } from "./PlaceCardPhoto";
import PlaceHeroMedia from "./PlaceHeroMedia";
import SearchPlaceVisual, { SearchPlaceVisualCredit, SearchPlaceVisualImage } from "@/components/search/SearchPlaceVisual";
import { MapPeekPhoto } from "@/components/map/MapPeek";
import {
  recordPlaceCardPhotoResult, selectedPlaceCardPhoto,
  type PlaceCardPhotoPlan, type PlaceCardPhotoSource, type PlaceCardPhotoState,
} from "@/lib/place-card-photo";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// Controlled source, independent of any new catalog or registry mapping.
const curatedSource = {
  kind: "curated",
  src: "/place-photos/framing-fixture.jpg",
  alt: "The named fixture museum entrance.",
  objectPosition: "bottom",
  photo: {
    file: "Framing fixture.jpg",
    alt: "The named fixture museum entrance.",
    author: "Fixture Photographer",
    license: "CC BY-SA 4.0",
    source_url: "https://commons.wikimedia.org/wiki/File:Framing_fixture.jpg",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    modifications: "The reviewed rendition is stored unchanged; display may crop the photograph.",
    localSrc: "/place-photos/framing-fixture.jpg",
    verified: true,
    objectPosition: "bottom",
  },
} satisfies PlaceCardPhotoSource;

function oneSourcePlan(source: PlaceCardPhotoSource): PlaceCardPhotoPlan {
  return { key: JSON.stringify(source), sources: [source] };
}

function CardFramingFixture({ source }: { source: PlaceCardPhotoSource }) {
  const plan = oneSourcePlan(source);
  const [state, setState] = useState<PlaceCardPhotoState | null>(null);
  const selected = selectedPlaceCardPhoto(plan, state);
  return <>
    <PlaceCardPhoto source={selected}
      onResult={(src, result) => setState(current => recordPlaceCardPhotoResult(plan, current, src, result))} />
    <PlaceCardPhotoCredit source={selected} loaded={Boolean(selected && state?.loadedSrc === selected.src)} />
  </>;
}

function hero(source: PlaceCardPhotoSource) {
  return <PlaceHeroMedia plan={oneSourcePlan(source)} name="Fixture Museum" aspectRatio="16/9"
    width={1200} height={800} size="hero" priority={false} golden={false}>
    <span>Fixture Museum facts</span>
  </PlaceHeroMedia>;
}

describe("reviewed place photo framing at mounted consumers", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Photo framing checks must not request the network."); }));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    expect(fetch).not.toHaveBeenCalled();
    host.remove();
    vi.unstubAllGlobals();
  });

  const render = async (element: ReactNode) => act(async () => root.render(element));
  const image = () => {
    const element = host.querySelector("img");
    if (!element) throw new Error("Expected the real consumer to render its source image.");
    return element;
  };
  async function decode(element: HTMLImageElement) {
    Object.defineProperties(element, {
      naturalWidth: { configurable: true, value: 1280 },
      naturalHeight: { configurable: true, value: 1371 },
    });
    await act(async () => element.dispatchEvent(new Event("load")));
  }
  function expectCreditPending() {
    const credit = host.querySelector<HTMLElement>(".place-card-photo-credit");
    if (credit) {
      expect(credit.getAttribute("aria-hidden")).toBe("true");
      expect(credit.style.visibility).toBe("hidden");
    }
  }
  function expectLoadedCredit() {
    const credit = host.querySelector<HTMLElement>(".place-card-photo-credit");
    expect(credit).not.toBeNull();
    expect(credit?.getAttribute("aria-hidden")).not.toBe("true");
    expect(credit?.style.visibility).not.toBe("hidden");
    expect(credit?.textContent).toContain(curatedSource.photo.author);
    expect(credit?.textContent).toContain(curatedSource.photo.modifications);
    expect(credit?.querySelector(`a[href="${curatedSource.photo.source_url}"]`)).not.toBeNull();
    expect(credit?.querySelector(`a[href="${curatedSource.photo.licenseUrl}"]`)?.textContent)
      .toBe(curatedSource.photo.license);
  }

  it.each(["card", "search thumbnail", "map peek", "canonical hero"] as const)(
    "keeps bottom framing and the decoded source credit on the %s, then exhausts failed media",
    async surface => {
      if (surface === "card") await render(<CardFramingFixture source={curatedSource} />);
      else if (surface === "search thumbnail") await render(
        <SearchPlaceVisual source={curatedSource}>
          <Link href="/places/fixture-museum"><SearchPlaceVisualImage fallback={<span>Place mark</span>} />Fixture Museum</Link>
          <SearchPlaceVisualCredit />
        </SearchPlaceVisual>,
      );
      else if (surface === "map peek") await render(
        <MapPeekPhoto plan={oneSourcePlan(curatedSource)} placeName="Fixture Museum" glyph="M"
          color="var(--app-brand)" onOpenDetails={() => {}}>
          <button type="button">Details</button>
        </MapPeekPhoto>,
      );
      else await render(hero(curatedSource));

      const photograph = image();
      expect(photograph.getAttribute("src")).toBe(curatedSource.src);
      expect(photograph.style.objectPosition).toBe("bottom");
      expectCreditPending();
      await decode(photograph);
      expectLoadedCredit();
      await act(async () => photograph.dispatchEvent(new Event("error")));
      expect(host.querySelector("img")).toBeNull();
      expect(host.querySelector(".place-card-photo-credit")).toBeNull();
    },
  );

  it.each(["left", "right"] as const)("preserves owned %s framing in the mounted canonical hero without third-party credit", async objectPosition => {
    const ownedSource = {
      kind: "owned", src: `/images/framing-owned-${objectPosition}.jpg`,
      alt: "The exact owned fixture landmark.", objectPosition,
    } satisfies PlaceCardPhotoSource;
    await render(hero(ownedSource));
    const photograph = image();
    expect(photograph.style.objectPosition).toBe(objectPosition);
    await decode(photograph);
    expect(host.querySelector(".place-card-photo-credit")).toBeNull();
    await act(async () => photograph.dispatchEvent(new Event("error")));
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector(".place-card-photo-credit")).toBeNull();
  });
});
