import type { Metadata } from "next";
import { Compass, Zap, MapPin } from "lucide-react";
import { Button } from "@/components/ui/Button";
import Pill from "@/components/ui/Pill";
import { Chip } from "@/components/ui/Chip";
import SectionHeading from "@/components/ui/SectionHeading";
import EmptyState from "@/components/ui/EmptyState";

/**
 * /styleguide — the living design system, in the app itself.
 *
 * A single browsable reference for the brand: palette, type scale, radii,
 * elevation, and the real UI primitives (Button, Pill, Chip, SectionHeading,
 * EmptyState…). Because it imports the SAME components the app ships, it never
 * drifts from production — change a primitive and this page updates with it.
 *
 * Orphan-by-design: an internal reference, kept out of the index + nav. Reach
 * it by direct URL (/styleguide).
 */
export const metadata: Metadata = {
  title: "Style guide",
  description: "Review the palette, type, and components in the Frederick Radius design system.",
  robots: { index: false, follow: false },
};

const PALETTE: Array<{ name: string; varName: string; ink?: boolean }> = [
  { name: "Paper", varName: "--app-bg", ink: true },
  { name: "Elevated", varName: "--app-bg-elevated", ink: true },
  { name: "Sunken", varName: "--app-bg-sunken", ink: true },
  { name: "Ink", varName: "--app-ink" },
  { name: "Ink 2", varName: "--app-ink-2" },
  { name: "Ink 3", varName: "--app-ink-3" },
  { name: "Signal vermilion", varName: "--app-brand" },
  { name: "Vermilion (press)", varName: "--app-brand-press" },
  { name: "Spruce", varName: "--app-brand-2" },
  { name: "Almanac gold", varName: "--app-accent" },
  { name: "Gold (press)", varName: "--app-accent-press" },
  { name: "Creek slate", varName: "--app-cool" },
  { name: "Positive", varName: "--app-positive" },
  { name: "Warning", varName: "--app-warning", ink: true },
  { name: "Danger", varName: "--app-danger" },
  { name: "Border", varName: "--app-border", ink: true },
];

const RADII = [
  { name: "sm · 9px", varName: "--app-radius-sm" },
  { name: "md · 16px", varName: "--app-radius-md" },
  { name: "lg · 24px", varName: "--app-radius-lg" },
  { name: "xl", varName: "--app-radius-xl" },
];

const ELEVATION = ["--app-elev-1", "--app-elev-2", "--app-elev-3", "--app-elev-4"];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
      {children}
    </p>
  );
}

export default function StyleGuidePage() {
  return (
    <div className="relative mx-auto w-full max-w-screen-md space-y-10 py-6">
      <header className="space-y-2">
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          Design system
        </p>
        <h1 className="font-serif text-[32px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
          The Frederick Radius style guide.
        </h1>
        <p className="text-[14px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
          The real palette, type, and components, pulled live from the app. If a
          primitive changes, this page changes with it.
        </p>
      </header>

      {/* ── Palette ───────────────────────────────────────────────── */}
      <section className="space-y-3">
        <Eyebrow>Palette</Eyebrow>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PALETTE.map((c) => (
            <li
              key={c.varName}
              className="overflow-hidden rounded-[var(--app-radius-md)] border"
              style={{ borderColor: "var(--app-border)" }}
            >
              <div className="h-14 w-full" style={{ background: `var(${c.varName})` }} />
              <div className="px-2.5 py-2" style={{ background: "var(--app-bg-elevated)" }}>
                <p className="text-[12.5px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
                  {c.name}
                </p>
                <p className="font-mono text-[10px] leading-tight" style={{ color: "var(--app-ink-3)" }}>
                  {c.varName}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Type ──────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <Eyebrow>Type</Eyebrow>
        <div className="space-y-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
            Fraunces · serif display
          </p>
          <p className="font-serif text-[32px] font-semibold leading-tight tracking-tight" style={{ color: "var(--app-ink)" }}>
            Find what is worth your time.
          </p>
        </div>
        <div className="space-y-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
            Inter · UI
          </p>
          <p className="text-[15px] leading-relaxed" style={{ color: "var(--app-ink-2)" }}>
            From Downtown to the surrounding towns: food, events, parks, and the
            places worth your time, right now.
          </p>
        </div>
        <div className="space-y-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
            JetBrains Mono · data details
          </p>
          <p className="font-mono text-[14px] tabular-nums" style={{ color: "var(--app-ink)" }}>
            39.4143&deg; N · 77.4105&deg; W · 285,464 residents
          </p>
        </div>
      </section>

      {/* ── Radii ─────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <Eyebrow>Corner radii</Eyebrow>
        <div className="flex flex-wrap gap-3">
          {RADII.map((r) => (
            <div key={r.varName} className="space-y-1.5 text-center">
              <div
                className="h-16 w-16 border"
                style={{ borderRadius: `var(${r.varName})`, background: "var(--app-bg-elevated)", borderColor: "var(--app-border)" }}
              />
              <p className="font-mono text-[10px]" style={{ color: "var(--app-ink-3)" }}>{r.name}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Elevation ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <Eyebrow>Elevation</Eyebrow>
        <div className="flex flex-wrap gap-4 pb-2">
          {ELEVATION.map((e) => (
            <div key={e} className="space-y-1.5 text-center">
              <div
                className="grid h-16 w-16 place-items-center rounded-[var(--app-radius-md)]"
                style={{ background: "var(--app-bg-elevated)", boxShadow: `var(${e})` }}
              >
                <span className="font-mono text-[10px]" style={{ color: "var(--app-ink-3)" }}>{e.slice(-1)}</span>
              </div>
              <p className="font-mono text-[10px]" style={{ color: "var(--app-ink-3)" }}>{e}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Buttons ───────────────────────────────────────────────── */}
      <section className="space-y-3">
        <Eyebrow>Buttons</Eyebrow>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="quiet">Quiet</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="primary" size="sm">Small</Button>
          <Button variant="primary" size="md">Medium</Button>
          <Button variant="primary" size="lg">Large</Button>
          <Button variant="primary" iconLeft={<Zap className="h-4 w-4" />}>With icon</Button>
        </div>
      </section>

      {/* ── Pills ─────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <Eyebrow>Pills</Eyebrow>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="brand" active>Active</Pill>
          <Pill tone="brand">Brand</Pill>
          <Pill tone="cool">Cool</Pill>
          <Pill tone="ink">Ink</Pill>
          <Pill tone="prominent" active>Prominent</Pill>
          <Pill tone="brand" icon={<MapPin className="h-3.5 w-3.5" />}>With icon</Pill>
          <Pill tone="brand" count={12}>With count</Pill>
        </div>
      </section>

      {/* ── Chips ─────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <Eyebrow>Chips</Eyebrow>
        <div className="flex flex-wrap items-center gap-2">
          <Chip>Neutral</Chip>
          <Chip color="var(--app-positive)">Open now</Chip>
          <Chip color="var(--app-accent-press)">Local favorite</Chip>
          <Chip color="var(--app-cool)">Walkable</Chip>
          <Chip color="var(--app-brand-press)">Field notes</Chip>
          <Chip color="var(--app-warning)" tabular>3 min walk</Chip>
        </div>
      </section>

      {/* ── Section heading ───────────────────────────────────────── */}
      <section className="space-y-3">
        <Eyebrow>Section heading</Eyebrow>
        <SectionHeading title="Worth your time" count={12} href="/places" cta="See all" />
      </section>

      {/* ── Empty state ───────────────────────────────────────────── */}
      <section className="space-y-3">
        <Eyebrow>Empty state</Eyebrow>
        <EmptyState
          icon={Compass}
          title="No events are on the calendar today."
          body="When something's on, it'll show up here first."
          tone="brand"
          cta={{ label: "Browse all events", href: "/events" }}
        />
      </section>
    </div>
  );
}
