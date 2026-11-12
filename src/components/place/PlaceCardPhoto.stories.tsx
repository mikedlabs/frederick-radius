import { useLayoutEffect, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import { placeCardPhotoPlan, type PlaceCardPhotoSource } from "@/lib/place-card-photo";
import PlaceCardPhoto, { PlaceCardPhotoCredit } from "./PlaceCardPhoto";

// Explicitly synthetic workshop transport. No provider requests or venue claims.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAIAAABMXPacAAAA+klEQVR4nO3RQQ0AIAzAwFlCAy7wLwQZe/SSCmhyc97VYrN+EA8AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2gEA0A4AgHYAALQDAKAdAADtAABoBwBAOwAA2n3CYoL+9wOv8gAAAABJRU5ErkJggg==";
const name = "places/workshop/photos/hero";
const source: PlaceCardPhotoSource = {
  kind: "google",
  src: `/api/place-photo?name=${encodeURIComponent(name)}&slug=workshop&w=360&fallback=signal`,
  alt: "Synthetic transport fixture",
  attribution: { photo_name: name, google_maps_uri: "https://www.google.com/maps/photos/workshop",
    authors: [{ display_name: "Workshop photographer" }] },
};
let requests: string[] = [];

function Fixture({ fallback = false, replaceCredit = false }: { fallback?: boolean; replaceCredit?: boolean }) {
  const [result, setResult] = useState("pending");
  const [revision, setRevision] = useState(0);
  const basePhoto = fallback ? { ...source, src: source.src.replace("photos%2Fhero", "photos%2Fcapped") } : source;
  const photo = revision && basePhoto.kind === "google" ? { ...basePhoto, attribution: {
    ...basePhoto.attribution, authors: [{ display_name: "Updated workshop photographer" }],
  } } : basePhoto;
  const currentRevision = useRef(revision);
  useLayoutEffect(() => { currentRevision.current = revision; }, [revision]);
  const shown = result === "failed" ? null : photo;
  return <div style={{ width: "min(280px, calc(100vw - 32px))" }}>
    <h2>Photo transport fixture</h2>
    {replaceCredit && <button type="button" onClick={() => { setResult("pending"); setRevision((value) => value + 1); }}>Replace source credit</button>}
    <div data-photo-scroll style={{ height: 180, overflow: "auto" }}>
      <div aria-hidden="true" style={{ height: 420 }} />
      <div data-photo-target>
        <PlaceCardPhoto source={shown} decodeIdentity={replaceCredit ? JSON.stringify(photo) : undefined}
          onResult={(_src, status) => { if (currentRevision.current === revision) setResult(status); }} deferGoogleBytes />
        <PlaceCardPhotoCredit source={shown} loaded={result === "loaded"} />
        <p>Place details</p>
        <p role="status">{result}</p>
      </div>
    </div>
  </div>;
}

const meta = {
  title: "Places/Visible photo transport",
  component: PlaceCardPhoto,
  parameters: { layout: "centered" },
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  args: { source, onResult: () => {} },
  beforeEach: () => {
    requests = [];
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(raw, window.location.href);
      if (url.pathname !== "/api/place-photo") return original(input, init);
      requests.push(raw);
      if (url.searchParams.get("name") === "places/workshop/photos/capped") {
        return new Response("fallback signal", { headers: { "Content-Type": "image/png", "X-Photo-Fallback": "daily-cap" } });
      }
      return new Response(Uint8Array.from(atob(PNG), (character) => character.charCodeAt(0)), {
        headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" },
      });
    };
    return () => { window.fetch = original; };
  },
} satisfies Meta<typeof PlaceCardPhoto>;
export default meta;
type Story = StoryObj<typeof meta>;

async function enterFrame(canvasElement: HTMLElement) {
  // A real clipped scroll container keeps this frame out of the observer range.
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  await expect(requests).toHaveLength(0);
  const target = canvasElement.querySelector<HTMLElement>("[data-photo-target]")!;
  target.scrollIntoView({ block: "nearest" });
}

export const VisibleResponseDecodesOnce: Story = {
  render: () => <Fixture />,
  play: async ({ canvasElement }) => {
    await enterFrame(canvasElement);
    const image = await within(canvasElement).findByRole("img", { name: "Synthetic transport fixture" }) as HTMLImageElement;
    await image.decode();
    await expect(image.naturalWidth).toBeGreaterThan(1);
    await expect(image.naturalHeight).toBeGreaterThan(1);
    await expect(image.src).toMatch(/^blob:/);
    await waitFor(() => expect(canvasElement.querySelector(".place-card-photo-credit")).not.toHaveAttribute("aria-hidden", "true"));
    await expect(within(canvasElement).getByText("Workshop photographer")).toBeVisible();
    await expect(within(canvasElement).getByRole("link", { name: "Google Maps" })).toHaveAttribute("href", source.kind === "google" ? source.attribution.google_maps_uri! : "");
    await expect(requests).toHaveLength(1);
  },
};

export const CappedResponseCollapsesHonestly: Story = {
  render: () => <Fixture fallback />,
  play: async ({ canvasElement }) => {
    await enterFrame(canvasElement);
    await waitFor(() => expect(within(canvasElement).getByRole("status")).toHaveTextContent("failed"));
    await expect(canvasElement.querySelector("[data-place-card-photo]")).toBeNull();
    await expect(canvasElement.querySelector(".place-card-photo-credit")).toBeNull();
    await expect(within(canvasElement).getByText("Place details")).toBeVisible();
    await expect(requests).toHaveLength(1);
  },
};

export const ReplacementCreditReusesDecodedResponse: Story = {
  render: () => <Fixture replaceCredit />,
  play: async ({ canvasElement }) => {
    await enterFrame(canvasElement);
    const canvas = within(canvasElement);
    const oldImage = await canvas.findByRole("img", { name: "Synthetic transport fixture" }) as HTMLImageElement;
    await oldImage.decode();
    await waitFor(() => expect(canvas.getByText("Workshop photographer")).toBeVisible());
    const responseUrl = oldImage.src;
    await canvas.getByRole("button", { name: "Replace source credit" }).click();
    await waitFor(() => expect(canvas.getByRole("img", { name: "Synthetic transport fixture" })).not.toBe(oldImage));
    const newImage = canvas.getByRole("img", { name: "Synthetic transport fixture" }) as HTMLImageElement;
    await newImage.decode();
    await waitFor(() => expect(canvas.getByText("Updated workshop photographer")).toBeVisible());
    await expect(newImage.src).toBe(responseUrl);
    await expect(requests).toHaveLength(1);
  },
};

function MuseumFramingFixture() {
  const photo = placeCardPhotoPlan({ slug: "national-museum-civil-war-medicine-frederick" }, 360).sources[0];
  const [status, setStatus] = useState("pending");
  const shown = status === "failed" ? null : photo;
  return <article style={{ width: "min(358px, calc(100vw - 32px))" }}>
    <h2>National Museum of Civil War Medicine</h2>
    <PlaceCardPhoto source={shown} onResult={(_src, result) => setStatus(result)} />
    <PlaceCardPhotoCredit source={shown} loaded={status === "loaded"} />
    <p>Visit the museum at 48 East Patrick Street in Frederick.</p>
  </article>;
}

export const MuseumEntranceFraming: Story = {
  render: () => <MuseumFramingFixture />,
  play: async ({ canvasElement }) => {
    const image = canvasElement.querySelector<HTMLImageElement>("img")!;
    await waitFor(async () => {
      await image.decode();
      await expect(image.naturalWidth).toBeGreaterThan(1);
      await expect(image.naturalHeight).toBeGreaterThan(1);
    }, { timeout: 5000 });
    const url = new URL(image.currentSrc, window.location.href);
    await expect(url.pathname === "/place-photos/civil-war-medicine-frontage.jpg" || url.searchParams.get("url") === "/place-photos/civil-war-medicine-frontage.jpg").toBe(true);
    await expect(getComputedStyle(image).objectPosition).toBe("50% 100%");
    await waitFor(() => expect(within(canvasElement).getByText("Photo by NatMuseCivMed.")).toBeVisible());
    await expect(within(canvasElement).getByRole("link", { name: "CC BY-SA 4.0" })).toHaveAttribute("href", "https://creativecommons.org/licenses/by-sa/4.0/");
    await expect(within(canvasElement).getByRole("link", { name: "Wikimedia Commons" })).toHaveAttribute("href", "https://commons.wikimedia.org/wiki/File:National_Museum_of_Civil_War_Medicine_frontage.jpg");
    image.dispatchEvent(new Event("error"));
    await waitFor(() => expect(canvasElement.querySelector("img")).toBeNull());
    await expect(canvasElement.querySelector(".place-card-photo-credit")).toBeNull();
    await expect(within(canvasElement).getByRole("heading", { name: "National Museum of Civil War Medicine" })).toBeVisible();
    await expect(requests).toHaveLength(0);
  },
};
