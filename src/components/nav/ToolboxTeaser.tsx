import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { RADIUS_TOOLS, type RadiusToolTone } from "@/data/radius-tools";

const SHORTCUT_IDS = ["public-essentials", "parking", "transit", "county-pulse"] as const;
const SHORTCUTS = SHORTCUT_IDS.map((id) => RADIUS_TOOLS.find((tool) => tool.id === id)).filter(
  (tool): tool is NonNullable<typeof tool> => Boolean(tool),
);

const TONE_COLOR: Record<RadiusToolTone, string> = {
  accent: "var(--app-accent-press)",
  brand: "var(--app-brand-press)",
  civic: "var(--app-civic)",
  cool: "var(--app-cool)",
  positive: "var(--app-positive)",
};

/** A short practical shelf. The All tools page owns the complete directory. */
export default function ToolboxTeaser() {
  return (
    <section
      aria-labelledby="toolbox-teaser-heading"
      className="mt-6 border-t pt-4"
      style={{ borderColor: "var(--app-border)" }}
    >
      <h2
        id="toolbox-teaser-heading"
        className="font-sans text-[17px] font-semibold leading-tight tracking-tight"
        style={{ color: "var(--app-ink)" }}
      >
        Practical shortcuts
      </h2>

      <ul className="mt-3 grid grid-cols-2 gap-2">
        {SHORTCUTS.map((tool) => (
          <li key={tool.id}>
            <Link
              href={tool.href}
              prefetch={false}
              className="tactile-interactive flex min-h-12 items-center gap-2 rounded-[var(--app-radius-md)] border px-3 text-[12px] font-semibold leading-tight outline-none transition hover:bg-[var(--app-bg-sunken)] focus-visible:ring-2 focus-visible:ring-[var(--app-brand)] active:scale-[0.99]"
              style={{
                borderColor: "var(--app-border)",
                background: "var(--app-bg-elevated)",
                color: "var(--app-ink)",
              }}
            >
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: TONE_COLOR[tool.tone] }}
              />
              {tool.label}
            </Link>
          </li>
        ))}
      </ul>

      <Link
        href="/compass"
        prefetch={false}
        className="tap-44-y mt-2 flex min-h-11 items-center justify-between gap-3 px-1 py-2 text-[12.5px] font-semibold"
        style={{ color: "var(--app-brand-press)" }}
      >
        All tools
        <ArrowRight className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
      </Link>
    </section>
  );
}
