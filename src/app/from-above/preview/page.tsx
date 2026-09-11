import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Metadata } from "next";
import BookExperience from "./BookExperience";

// Prototype route for the interactive coffee-table-book experience.
// We deliberately live outside the (app) route group so the TopBar /
// BottomNav don't intrude on the full-bleed photography. The only
// outbound from this surface is miked.store for the hardcover.
//
// The manifest is built by scripts/build-from-above-preview.mjs from
// the print PDF and committed under /public/from-above. We read it at
// build/request time rather than imitating it in code so the source of
// truth is the actual extracted asset list.

export const metadata: Metadata = {
  robots: { index: false },
  title: "From above · Frederick Radius",
  description:
    "Six years of drone photography over Downtown Frederick, organized by season. Open the book.",
};

type Manifest = {
  cover: string;
  photos: Array<{
    id: string;
    src: string;
    srcSet: string;
    width: number;
    height: number;
    orient: "landscape" | "portrait";
  }>;
};

async function loadManifest(): Promise<Manifest> {
  const buf = await readFile(join(process.cwd(), "public/from-above/manifest.json"), "utf8");
  return JSON.parse(buf) as Manifest;
}

export default async function FromAbovePreviewPage() {
  const manifest = await loadManifest();
  return <BookExperience cover={manifest.cover} photos={manifest.photos} />;
}
