import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BusFront,
  MapPin,
  ParkingCircle,
  type LucideIcon,
} from "lucide-react";
import { RADIUS_TOOLS, type RadiusTool, type RadiusToolTone } from "@/data/radius-tools";

function registeredTool(id: string): RadiusTool {
  const tool = RADIUS_TOOLS.find((candidate) => candidate.id === id);
  if (!tool) throw new Error(`Missing Radius tool: ${id}`);
  return tool;
}

const PRIMARY_TOOL = registeredTool("public-essentials");
const SUPPORTING_TOOLS: readonly { tool: RadiusTool; icon: LucideIcon }[] = [
  { tool: registeredTool("parking"), icon: ParkingCircle },
  { tool: registeredTool("transit"), icon: BusFront },
  { tool: registeredTool("county-pulse"), icon: Activity },
];

const TONE_COLOR: Record<RadiusToolTone, string> = {
  accent: "var(--app-accent-press)",
  brand: "var(--app-brand-press)",
  civic: "var(--app-civic)",
  cool: "var(--app-cool)",
  positive: "var(--app-positive)",
};

/**
 * Today keeps one job-led utility surface rather than repeating Compass.
 *
 * The urgent, location-aware action gets the strongest treatment. Three
 * supporting tools remain one tap away, and the complete directory has one
 * quiet exit. This is deliberate progressive disclosure: useful immediately,
 * comprehensive only when somebody asks for it.
 */
export default function ToolboxTeaser() {
  return (
    <section
      aria-labelledby="toolbox-teaser-heading"
      className="mt-6 border-t pt-4"
      style={{ borderColor: "var(--app-border)" }}
    >
      <header className="flex items-center gap-3">
        <h2
          id="toolbox-teaser-heading"
          className="font-sans text-[17px] font-semibold leading-tight tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Quick tools
        </h2>
        <span
          aria-hidden
          className="h-px min-w-4 flex-1"
          style={{ background: "var(--app-border)" }}
        />
        <Link
          href="/compass"
          prefetch={false}
          className="tap-44-y inline-flex shrink-0 items-center gap-1 px-1 text-[12px] font-semibold"
          style={{ color: "var(--app-brand-press)" }}
        >
          All tools
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        </Link>
      </header>

      <Link
        href={PRIMARY_TOOL.href}
        prefetch={false}
        className="tactile-interactive group mt-3 flex min-h-[72px] items-center gap-3 overflow-hidden rounded-[var(--app-radius-md)] border px-3.5 py-3 outline-none transition hover:bg-[var(--app-bg-sunken)] focus-visible:ring-2 focus-visible:ring-[var(--app-brand)] active:scale-[0.99]"
        style={{
          borderColor: "color-mix(in srgb, var(--app-civic) 28%, var(--app-border))",
          background:
            "linear-gradient(115deg, color-mix(in srgb, var(--app-civic) 8%, var(--app-bg-elevated)), var(--app-bg-elevated) 68%)",
          boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)",
          color: "var(--app-ink)",
        }}
      >
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--app-radius-sm)]"
          style={{
            background: "color-mix(in srgb, var(--app-civic) 12%, transparent)",
            color: "var(--app-civic)",
          }}
        >
          <MapPin className="h-5 w-5" strokeWidth={2.1} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold leading-tight">
            Find the nearest essential
          </span>
          <span
            className="mt-1 block text-[11.5px] leading-snug"
            style={{ color: "var(--app-ink-3)" }}
          >
            Restroom, water, trash, dog bags, seating, or power
          </span>
        </span>
        <ArrowRight
          className="h-4 w-4 shrink-0 opacity-45 transition-transform group-hover:translate-x-0.5"
          strokeWidth={2.25}
          aria-hidden
        />
      </Link>

      <ul className="mt-2 grid grid-cols-3 gap-2">
        {SUPPORTING_TOOLS.map(({ tool, icon: Icon }) => (
          <li key={tool.id}>
            <Link
              href={tool.href}
              prefetch={false}
              className="tactile-interactive flex min-h-[66px] flex-col items-start justify-between gap-2 rounded-[var(--app-radius-md)] border px-3 py-2.5 text-left text-[11.5px] font-semibold leading-tight outline-none transition hover:bg-[var(--app-bg-sunken)] focus-visible:ring-2 focus-visible:ring-[var(--app-brand)] active:scale-[0.98]"
              style={{
                borderColor: "var(--app-border)",
                background: "var(--app-bg-elevated)",
                color: "var(--app-ink)",
              }}
            >
              <span
                aria-hidden
                className="grid h-7 w-7 place-items-center rounded-[6px]"
                style={{
                  color: TONE_COLOR[tool.tone],
                  background: `color-mix(in srgb, ${TONE_COLOR[tool.tone]} 10%, transparent)`,
                }}
              >
                <Icon className="h-4 w-4" strokeWidth={2} />
              </span>
              <span>{tool.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
