import type { Metadata } from "next";
import SavedList from "@/components/saved/SavedList";

export const metadata: Metadata = {
  title: "Saved",
  description: "Your saved places, events, and radii.",
};

export default function SavedPage() {
  return (
    <div className="space-y-5">
      {/* Header trimmed: the SavedList component carries its own
          "Your Frederick" hero block so a second outer title would
          stack two headings on top of each other. */}
      <header>
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          Saved · on this device
        </p>
        <h1 className="display-1" style={{ color: "var(--app-ink)" }}>
          Your list
        </h1>
      </header>
      <SavedList />
    </div>
  );
}
