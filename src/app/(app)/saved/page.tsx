import type { Metadata } from "next";
import SavedList from "@/components/saved/SavedList";

export const metadata: Metadata = {
  title: "Saved",
  description: "Your saved places, events, and radii.",
};

export default function SavedPage() {
  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
          Local to this device · sync coming soon
        </p>
        <h1 className="font-serif text-[28px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          Saved
        </h1>
      </header>
      <SavedList />
    </div>
  );
}
