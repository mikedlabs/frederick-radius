import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";
import type { PlaceCardPhotoSource } from "@/lib/place-card-photo";
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

function Fixture({ fallback = false }: { fallback?: boolean }) {
  const [result, setResult] = useState("pending");
  const photo = fallback ? { ...source, src: source.src.replace("photos%2Fhero", "photos%2Fcapped") } : source;
  const shown = result === "failed" ? null : photo;
  return <div style={{ width: "min(280px, calc(100vw - 32px))" }}>
    <h2>Photo transport fixture</h2>
    <div data-photo-scroll style={{ height: 180, overflow: "auto" }}>
      <div aria-hidden="true" style={{ height: 420 }} />
      <div data-photo-target>
        <PlaceCardPhoto source={shown} onResult={(_src, status) => setResult(status)} deferGoogleBytes />
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
