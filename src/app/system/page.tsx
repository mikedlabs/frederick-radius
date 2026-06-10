import type { Metadata } from "next";
import Omnibox from "@/components/system/Omnibox";
import FilterChip from "@/components/system/FilterChip";
import StateDot, { type OpenState } from "@/components/system/StateDot";
import ResultRow from "@/components/system/ResultRow";
import CardSlot from "@/components/system/CardSlot";
import Pin from "@/components/system/Pin";
import RadiusRing from "@/components/system/RadiusRing";
import Skeleton from "@/components/ui/Skeleton";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false },
};

/**
 * /system — the redesign primitive gallery (Phase 1 deliverable).
 *
 * Renders every new primitive in every state (default / empty / loading /
 * error / long-text) on the paper ground, chrome-free, so the visual
 * language can be approved BEFORE it touches real surfaces. This is the
 * screenshot target for the look-and-fix loop.
 */
const STATES: OpenState[] = ["open", "closing-soon", "closed", "unverified", "unknown"];

const ROWS: Array<React.ComponentProps<typeof ResultRow>> = [
  { name: "Brewer's Alley", category: "Brewery", state: "open", walk: "4 min", hook: "Flagship brewpub, packed patio" },
  { name: "Dublin Roasters Coffee", category: "Coffee", state: "open", walk: "7 min", hook: "Family roaster, fair-trade beans" },
  { name: "Carroll Creek Linear Park", category: "Park", state: "open", walk: "2 min", hook: "The downtown waterway promenade" },
  { name: "Hinzi's Kitchen", category: "Restaurant", state: "closing-soon", walk: "9 min", hook: "Closes at 9 — go now" },
  { name: "The Weinberg Center for the Arts", category: "Theater", state: "closed", walk: "5 min", hook: "Opens 5pm for tonight's show" },
  { name: "McClintock Distillery", category: "Distillery", state: "closed", walk: "12 min" },
  { name: "Sky Stage", category: "Arts", state: "unverified", walk: "6 min", hook: "Open-air mural amphitheater" },
  { name: "Baker Park", category: "Park", state: "open", walk: "8 min", hook: "58 acres, the bell tower, the lake" },
  { name: "Frederick Coffee Co. & Cafe", category: "Coffee", state: "open", walk: "3 min", hook: "Since 1995, the local third place" },
];

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="t-section" style={{ color: "var(--app-ink)" }}>{title}</h2>
        {note && <p className="t-meta" style={{ color: "var(--app-ink-3)" }}>{note}</p>}
      </div>
      {children}
    </section>
  );
}

export default function SystemPage() {
  return (
    <div style={{ background: "var(--app-bg)", minHeight: "100vh" }}>
      <div className="mx-auto max-w-3xl space-y-10 px-5 py-10">
        <header className="space-y-1">
          <p className="t-meta t-semibold uppercase tracking-[0.16em]" style={{ color: "var(--app-cool)" }}>
            FrederickRadius · Design system
          </p>
          <h1 className="t-display" style={{ color: "var(--app-ink)" }}>The instrument kit.</h1>
          <p className="t-lead measure" style={{ color: "var(--app-ink-2)" }}>
            Fraunces for the field-guide voice, Inter for the instrument. The
            three things the identity rests on: the radius ring, the open-state
            system, and the row-based list.
          </p>
        </header>

        {/* TYPE */}
        <Section title="Type scale" note="Inter 12–20 (UI) · Fraunces 28/40 (display)">
          <div className="space-y-1.5 rounded-[var(--app-radius-md)] p-4" style={{ background: "var(--app-bg-elevated-solid)", boxShadow: "var(--app-edge)" }}>
            <p className="t-display" style={{ color: "var(--app-ink)" }}>Display 40 — Fraunces</p>
            <p className="t-title" style={{ color: "var(--app-ink)" }}>Title 28 — Fraunces</p>
            <p className="t-section" style={{ color: "var(--app-ink)" }}>Section 20 — Inter semibold</p>
            <p className="t-lead" style={{ color: "var(--app-ink)" }}>Lead 16 — Inter, row titles + emphasis</p>
            <p className="t-body" style={{ color: "var(--app-ink-2)" }}>Body 14 — Inter, the default reading + row hooks</p>
            <p className="t-meta" style={{ color: "var(--app-ink-3)" }}>Meta 12 — Inter, chips, labels, the quiet tier</p>
          </div>
        </Section>

        {/* OPEN STATE */}
        <Section title="Open-state system" note="Open = green · Closing soon = amber · Closed = neutral (never red)">
          <div className="flex flex-wrap gap-4 rounded-[var(--app-radius-md)] p-4" style={{ background: "var(--app-bg-elevated-solid)", boxShadow: "var(--app-edge)" }}>
            {STATES.map((s) => (
              <span key={s} className="inline-flex items-center gap-2">
                <StateDot state={s} />
                <span className="t-meta" style={{ color: "var(--app-ink-2)" }}>{s}</span>
              </span>
            ))}
          </div>
        </Section>

        {/* OMNIBOX */}
        <Section title="Omnibox" note="The one search input. Type “coffee open now” and press enter → the intent becomes a removable chip.">
          <Omnibox initialChips={["open-now"]} />
          <div className="flex flex-wrap gap-1.5 pt-1">
            <FilterChip label="Tonight" onRemove={() => {}} />
            <FilterChip label="With kids" onRemove={() => {}} />
            <FilterChip label="Outdoors" tone="neutral" />
          </div>
        </Section>

        {/* RESULT ROWS — density proof */}
        <Section title="Result rows" note="64px, no image. ≥9 scannable per phone screen — the density + load-speed engine.">
          <div className="overflow-hidden rounded-[var(--app-radius-md)]" style={{ background: "var(--app-bg-elevated-solid)", boxShadow: "var(--app-edge)" }}>
            {ROWS.map((r, i) => (
              <ResultRow key={r.name} {...r} href="#" active={i === 1} />
            ))}
          </div>
        </Section>

        {/* CARD SLOT */}
        <Section title="Curated card slot" note="One photographic card max, pinned to a list top, clearly editorial. Left: photo. Right: typographic fallback (no photo).">
          <div className="grid gap-3 sm:grid-cols-2">
            <CardSlot
              title="A walk on Carroll Creek"
              hook="Start at the amphitheater, end with a beer at the Alley."
              href="#"
              accent="var(--app-cool)"
              photo={
                <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #2b5a73, #20506a)" }} />
              }
            />
            <CardSlot
              title="Rainy-day Frederick"
              hook="Museums, the Weinberg, and a long lunch."
              href="#"
              accent="var(--app-brand)"
            />
          </div>
        </Section>

        {/* MAP PRIMITIVES */}
        <Section title="Map — pins by open state" note="Never a category rainbow. Selected pin gets a soft state ring.">
          <div className="flex flex-wrap items-end gap-5 rounded-[var(--app-radius-md)] p-5" style={{ background: "var(--app-bg-sunken)", boxShadow: "var(--app-edge)" }}>
            {STATES.map((s, i) => (
              <Pin key={s} state={s} selected={i === 0} />
            ))}
          </div>
        </Section>

        <Section title="The radius ring" note="The namesake. 5 / 10 / 15 minute walk, switchable — results filter to what's inside.">
          <div className="rounded-[var(--app-radius-md)] p-6" style={{ background: "var(--app-bg-elevated-solid)", boxShadow: "var(--app-edge)" }}>
            <RadiusRing />
          </div>
        </Section>

        {/* STATES: loading / empty / error */}
        <Section title="List states" note="Loading · empty · error — each gives direction, not just mood.">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2 rounded-[var(--app-radius-md)] p-3" style={{ background: "var(--app-bg-elevated-solid)", boxShadow: "var(--app-edge)" }}>
              <Skeleton.Row />
              <Skeleton.Row />
              <Skeleton.Row />
            </div>
            <div className="grid place-items-center rounded-[var(--app-radius-md)] p-6 text-center" style={{ background: "var(--app-bg-elevated-solid)", boxShadow: "var(--app-edge)" }}>
              <p className="t-body" style={{ color: "var(--app-ink-2)" }}>Nothing open in this radius.<br />Drag the ring wider, or clear filters.</p>
            </div>
            <div className="grid place-items-center rounded-[var(--app-radius-md)] p-6 text-center" style={{ background: "var(--app-bg-elevated-solid)", boxShadow: "var(--app-edge)" }}>
              <p className="t-body" style={{ color: "var(--app-ink-2)" }}>Couldn’t load results.<br /><span className="t-semibold" style={{ color: "var(--app-cool)" }}>Try again</span></p>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
