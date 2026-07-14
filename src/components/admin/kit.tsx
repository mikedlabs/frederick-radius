import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { ChevronRight, CircleCheck, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";

/**
 * Admin design kit — the operations-desk visual language in one place.
 *
 * The /admin hub was rebuilt (Jul 2026) into a calm field guide: hairline
 * lists instead of card stacks, mono grouping labels, serif section heads and
 * stat numbers, honest empty states, --app-* tokens only, tap-44 targets. This
 * module is the single source of truth for that language so every sub-page
 * reads as one surface. Purely presentational and server-safe (no server-only
 * imports), so both the server pages and the few "use client" review widgets
 * can import it.
 */

// ── Tone → ink ──────────────────────────────────────────────────────────────

export type Tone = "neutral" | "muted" | "positive" | "warning" | "danger" | "cool" | "brand";

const TONE_INK: Record<Tone, string> = {
  neutral: "var(--app-ink)",
  muted: "var(--app-ink-3)",
  positive: "var(--app-positive)",
  warning: "var(--app-warning-press)",
  danger: "var(--app-danger)",
  cool: "var(--app-cool)",
  brand: "var(--app-brand-press)",
};

export function toneInk(tone: Tone = "neutral"): string {
  return TONE_INK[tone];
}

/** A soft tinted background for a tone (badges, empty states, highlight rows). */
export function toneTint(tone: Tone, pct = 10): string {
  const base = tone === "neutral" || tone === "muted" ? "var(--app-ink)" : TONE_INK[tone];
  return `color-mix(in srgb, ${base} ${pct}%, var(--app-bg-elevated))`;
}

// ── Shell ───────────────────────────────────────────────────────────────────

/**
 * AdminShell — page frame every admin sub-page shares: cream ground, a back
 * link (defaults to the hub), an optional right-aligned status aside, a mono
 * eyebrow, a serif title, and optional intro prose. Keeps the header identical
 * across the whole surface.
 */
export function AdminShell({
  title,
  eyebrow,
  intro,
  back = { href: "/admin", label: "Admin" },
  aside,
  children,
}: {
  title: string;
  eyebrow?: ReactNode;
  intro?: ReactNode;
  back?: { href: string; label: string } | null;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-screen-md px-4 py-8" style={{ background: "var(--app-bg)" }}>
      {(back || aside) && (
        <div className="flex items-center justify-between gap-3">
          {back ? (
            <Link href={back.href} className="tap-44 inline-block text-xs" style={{ color: "var(--app-cool)" }}>
              ← {back.label}
            </Link>
          ) : (
            <span />
          )}
          {aside ? (
            <div className="text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
              {aside}
            </div>
          ) : null}
        </div>
      )}
      <header className="mt-3 space-y-1">
        {eyebrow ? (
          <p className="text-[11px] font-medium uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-serif text-[26px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          {title}
        </h1>
        {intro ? (
          <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
            {intro}
          </p>
        ) : null}
      </header>
      {children}
    </main>
  );
}

// ── Section heads ─────────────────────────────────────────────────────────────

/** A major content section: serif head, optional right aside + description. */
export function Section({
  title,
  description,
  aside,
  children,
  className = "mt-8",
}: {
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-[18px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
          {title}
        </h2>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
      {description ? (
        <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--app-ink-3)" }}>
          {description}
        </p>
      ) : null}
      {children}
    </section>
  );
}

/** A light grouping label (mono, uppercase) for tighter clusters. */
export function SectionLabel({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--app-ink-3)" }}>
        {children}
      </h2>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export type StatItem = {
  value: ReactNode;
  label: string;
  tone?: Tone;
  /** Week-over-week (or similar) delta; green up, muted down, hidden if 0. */
  delta?: number;
  deltaSuffix?: string;
};

/** A hairline divider between vitals in a strip. */
function VDiv() {
  return <div aria-hidden className="w-px shrink-0 self-stretch" style={{ background: "var(--app-border)" }} />;
}

/** One vital: a big serif number, a small label, an optional delta. */
export function Stat({ value, label, tone = "neutral", delta, deltaSuffix = "wk" }: StatItem) {
  return (
    <div className="flex-1 px-1 text-center">
      <p className="font-serif text-2xl font-semibold tabular-nums leading-none" style={{ color: toneInk(tone) }}>
        {value}
      </p>
      <p className="mt-1.5 text-[10px] leading-tight" style={{ color: "var(--app-ink-3)" }}>
        {label}
      </p>
      {typeof delta === "number" && delta !== 0 && (
        <p
          className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-medium"
          style={{ color: delta > 0 ? "var(--app-positive)" : "var(--app-ink-3)" }}
        >
          {delta > 0 ? <TrendingUp className="h-3 w-3" strokeWidth={2.5} aria-hidden /> : <TrendingDown className="h-3 w-3" strokeWidth={2.5} aria-hidden />}
          {delta > 0 ? "+" : ""}
          {delta} {deltaSuffix}
        </p>
      )}
    </div>
  );
}

/** The glance strip: up to ~4 vitals in one bordered row with hairline dividers. */
export function StatStrip({ items }: { items: StatItem[] }) {
  return (
    <div
      className="flex items-stretch justify-between rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] py-3"
      style={{ borderColor: "var(--app-border)" }}
    >
      {items.map((it, i) => (
        <div key={`${it.label}-${i}`} className="contents">
          {i > 0 && <VDiv />}
          <Stat {...it} />
        </div>
      ))}
    </div>
  );
}

/** A grid of stat cards — for counts that don't fit a single strip. */
export function StatCards({ items, cols = 4 }: { items: StatItem[]; cols?: 2 | 3 | 4 }) {
  const gridCol = cols === 2 ? "grid-cols-2" : cols === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4";
  return (
    <div className={`grid gap-2 ${gridCol}`}>
      {items.map((it, i) => (
        <div key={`${it.label}-${i}`} className="rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3 text-center" style={{ borderColor: "var(--app-border)" }}>
          <div className="font-serif text-[22px] font-semibold leading-none tracking-tight tabular-nums" style={{ color: toneInk(it.tone ?? "neutral") }}>
            {it.value}
          </div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--app-ink-3)" }}>
            {it.label}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Hairline list ─────────────────────────────────────────────────────────────

/** A rounded, bordered list whose rows are separated by hairlines, not cards. */
export function HairlineList({ children }: { children: ReactNode }) {
  return (
    <ul className="overflow-hidden rounded-[var(--app-radius-md)] border" style={{ borderColor: "var(--app-border)" }}>
      {children}
    </ul>
  );
}

/**
 * One row of a HairlineList. `href` makes it a tappable Link; otherwise it's a
 * static row (wrap it in <li> is done here). `index` draws the hairline above
 * every row after the first. A round tinted icon badge, title + optional
 * subtitle, an optional right-aligned meta / count badge, and a chevron for
 * links.
 */
export function HairlineRow({
  index = 0,
  href,
  icon: Icon,
  iconTone = "brand",
  dot,
  title,
  subtitle,
  meta,
  badge,
  chevron,
}: {
  index?: number;
  href?: string;
  icon?: LucideIcon;
  iconTone?: Tone;
  /** A leading status dot instead of an icon badge (feed connectivity rows). */
  dot?: Tone;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  badge?: ReactNode;
  chevron?: boolean;
}) {
  const showChevron = chevron ?? Boolean(href);
  const inner = (
    <>
      {Icon ? (
        <span
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
          style={{ background: `color-mix(in srgb, ${toneInk(iconTone)} 12%, transparent)` }}
        >
          <Icon className="h-[17px] w-[17px]" strokeWidth={2} style={{ color: toneInk(iconTone) }} />
        </span>
      ) : dot ? (
        <span className="grid h-8 w-3 shrink-0 place-items-center"><StatusDot tone={dot} /></span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium leading-tight" style={{ color: "var(--app-ink)" }}>
          {title}
        </span>
        {subtitle ? (
          <span className="mt-0.5 block truncate text-[11.5px] leading-tight" style={{ color: "var(--app-ink-3)" }}>
            {subtitle}
          </span>
        ) : null}
      </span>
      {meta ? <span className="shrink-0 text-right text-[12px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>{meta}</span> : null}
      {badge}
      {showChevron ? <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2} style={{ color: "var(--app-ink-3)" }} aria-hidden /> : null}
    </>
  );
  return (
    <li style={index > 0 ? { borderTop: "1px solid var(--app-border)" } : undefined}>
      {href ? (
        <Link href={href} className="flex min-h-11 items-center gap-3 bg-[var(--app-bg-elevated)] px-3 py-2.5 transition hover:bg-[var(--app-bg-sunken)]">
          {inner}
        </Link>
      ) : (
        <div className="flex items-center gap-3 bg-[var(--app-bg-elevated)] px-3 py-2.5">{inner}</div>
      )}
    </li>
  );
}

/** The round count pill used on queue rows (brand fill, white number). */
export function CountBadge({ n, tone = "brand" }: { n: number; tone?: Tone }) {
  return (
    <span
      className="grid h-6 min-w-[24px] shrink-0 place-items-center rounded-full px-1.5 font-mono text-[12.5px] font-bold tabular-nums"
      style={{ background: toneInk(tone), color: "var(--app-on-brand, #fff)" }}
    >
      {n}
    </span>
  );
}

// ── Status pills + dots ───────────────────────────────────────────────────────

/** A soft, tinted status pill (e.g. "Live", "3 dark", "accepted"). */
export function StatusPill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums"
      style={{ background: toneTint(tone, 14), color: toneInk(tone === "neutral" ? "muted" : tone) }}
    >
      {children}
    </span>
  );
}

/** A tiny status dot (green/amber/red…). */
export function StatusDot({ tone = "positive" }: { tone?: Tone }) {
  return <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: toneInk(tone) }} />;
}

/** An env/feature toggle chip with a status dot (the hub's Keys & switches). */
export function KeyChip({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className="inline-flex items-center justify-between rounded-full border px-3 py-1.5 text-[11.5px] font-medium"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", color: "var(--app-ink-2)" }}
    >
      {label}
      <span className="ml-2"><StatusDot tone={on ? "positive" : "warning"} /></span>
    </span>
  );
}

// ── Action tiles ──────────────────────────────────────────────────────────────

export function ActionGrid({ children, cols = 4 }: { children: ReactNode; cols?: 3 | 4 }) {
  return <div className={`grid gap-2 grid-cols-3 ${cols === 4 ? "sm:grid-cols-4" : ""}`}>{children}</div>;
}

export function ActionTile({ href, title, icon: Icon, tone = "brand" }: { href: string; title: string; icon: LucideIcon; tone?: Tone }) {
  return (
    <Link
      href={href}
      className="tap-44 flex flex-col items-center gap-2 rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] px-2 py-3.5 text-center transition hover:bg-[var(--app-bg-sunken)]"
      style={{ borderColor: "var(--app-border)" }}
    >
      <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full" style={{ background: `color-mix(in srgb, ${toneInk(tone)} 12%, transparent)` }}>
        <Icon className="h-[18px] w-[18px]" strokeWidth={2} style={{ color: toneInk(tone) }} />
      </span>
      <span className="text-[12px] font-semibold leading-tight" style={{ color: "var(--app-ink)" }}>
        {title}
      </span>
    </Link>
  );
}

// ── Empty states ──────────────────────────────────────────────────────────────

/** An honest empty state — a quiet tinted line, not a scary error box. */
export function EmptyState({ tone = "muted", icon: Icon, children }: { tone?: Tone; icon?: LucideIcon; children: ReactNode }) {
  return (
    <div
      className="mt-3 flex items-center gap-2.5 rounded-[var(--app-radius-md)] px-3 py-2.5 text-[12.5px]"
      style={{ background: toneTint(tone, tone === "muted" ? 5 : 9), color: toneInk(tone === "neutral" ? "muted" : tone) }}
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden /> : null}
      <span>{children}</span>
    </div>
  );
}

/** The green "all clear" affirmation (queue empty, nothing drifted). */
export function AllClear({ children }: { children: ReactNode }) {
  return (
    <div
      className="mt-3 flex items-center gap-2.5 rounded-[var(--app-radius-md)] border px-4 py-3.5"
      style={{
        borderColor: "color-mix(in srgb, var(--app-positive) 28%, var(--app-border))",
        background: "color-mix(in srgb, var(--app-positive) 6%, var(--app-bg-elevated))",
      }}
    >
      <CircleCheck className="h-5 w-5 shrink-0" strokeWidth={2} style={{ color: "var(--app-positive)" }} aria-hidden />
      <span className="text-[14px] font-medium" style={{ color: "var(--app-positive)" }}>
        {children}
      </span>
    </div>
  );
}

// ── Tables ────────────────────────────────────────────────────────────────────
// Low-level parts so each page keeps its own columns while sharing one look.

type Align = "left" | "right" | "center";
const ALIGN: Record<Align, string> = { left: "text-left", right: "text-right", center: "text-center" };

export function Table({ children }: { children: ReactNode }) {
  return (
    <div
      className="mt-3 overflow-x-auto rounded-[var(--app-radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]"
      role="region"
      aria-label="Scrollable data table"
      tabIndex={0}
    >
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr style={{ color: "var(--app-ink-3)" }}>{children}</tr>
    </thead>
  );
}

export function Th({ children, align = "left" }: { children?: ReactNode; align?: Align }) {
  return <th className={`py-1 pr-3 text-[11px] font-semibold uppercase tracking-[0.08em] ${ALIGN[align]}`}>{children}</th>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function Tr({ children }: { children: ReactNode }) {
  return (
    <tr className="border-b align-top" style={{ borderColor: "var(--app-border)" }}>
      {children}
    </tr>
  );
}

export function Td({ children, align = "left", tone = "neutral", mono, nums, semibold }: { children?: ReactNode; align?: Align; tone?: Tone; mono?: boolean; nums?: boolean; semibold?: boolean }) {
  return (
    <td className={`py-2 pr-3 ${ALIGN[align]} ${mono ? "font-mono tabular-nums" : nums ? "tabular-nums" : ""} ${semibold ? "font-semibold" : ""}`} style={{ color: toneInk(tone) }}>
      {children}
    </td>
  );
}

// ── Buttons (server-action forms) ─────────────────────────────────────────────

type BtnVariant = "primary" | "positive" | "danger" | "ghost";

const BTN_STYLE: Record<BtnVariant, React.CSSProperties> = {
  primary: { background: "var(--app-brand-press)", color: "var(--app-on-brand, #fff)" },
  positive: { background: "var(--app-positive)", color: "#fff" },
  danger: { background: "var(--app-danger)", color: "#fff" },
  ghost: { color: "var(--app-ink-3)" },
};

/**
 * A submit/action button for the review tools. Renders a native <button> so it
 * drops straight into a server-action <form>; pass name/value/type through.
 */
export function AdminButton({
  children,
  variant = "primary",
  icon: Icon,
  className = "",
  ...rest
}: {
  children: ReactNode;
  variant?: BtnVariant;
  icon?: LucideIcon;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`tap-44 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition ${className}`}
      style={BTN_STYLE[variant]}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden /> : null}
      {children}
    </button>
  );
}

// ── Diff pair (drift / before→after) ──────────────────────────────────────────

export function DiffPair({ before, after }: { before: ReactNode; after: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px]">
      <span
        className="rounded-[var(--app-radius-sm)] px-2 py-1 line-through"
        style={{ background: "color-mix(in srgb, var(--app-danger) 8%, transparent)", color: "var(--app-ink-2)" }}
      >
        {before}
      </span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden style={{ color: "var(--app-ink-3)" }} />
      <span
        className="rounded-[var(--app-radius-sm)] px-2 py-1 font-semibold"
        style={{ background: "color-mix(in srgb, var(--app-positive) 10%, transparent)", color: "var(--app-ink)" }}
      >
        {after}
      </span>
    </div>
  );
}

// ── Tags, callouts, notices ───────────────────────────────────────────────────

/** A small bordered category tag (e.g. a submission kind) — lighter than a pill. */
export function Tag({ tone = "brand", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]"
      style={{ borderColor: `color-mix(in srgb, ${toneInk(tone)} 40%, transparent)`, color: toneInk(tone) }}
    >
      {children}
    </span>
  );
}

/** A left-accent tinted callout (anomaly flags, integrity alerts). */
export function Callout({ tone = "warning", title, children }: { tone?: Tone; title?: ReactNode; children: ReactNode }) {
  return (
    <div
      className="rounded-[var(--app-radius-md)] border-l-4 px-3 py-2 text-[12px]"
      style={{ borderColor: toneInk(tone), background: toneTint(tone, 8), color: "var(--app-ink-2)" }}
    >
      {title ? (
        <div className="font-semibold" style={{ color: toneInk(tone) }}>
          {title}
        </div>
      ) : null}
      <div className={title ? "mt-0.5" : ""}>{children}</div>
    </div>
  );
}

/** A full-width tinted notice banner — form-result flashes, no-db warnings. */
export function Notice({ tone = "cool", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div
      className="rounded-[var(--app-radius-md)] px-3 py-2 text-[12.5px] font-medium"
      style={{ background: toneTint(tone, 12), color: toneInk(tone === "neutral" ? "muted" : tone) }}
    >
      {children}
    </div>
  );
}

/** A pill anchor that opens an external billing / docs page in a new tab. */
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="tap-44 inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[12px] font-semibold"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)", color: "var(--app-cool)" }}
    >
      {children}
      <span aria-hidden>↗</span>
    </a>
  );
}

// ── Progress ──────────────────────────────────────────────────────────────────

/** A thin progress bar (decided / total triage, coverage share). */
export function ProgressBar({ value, max, tone = "brand" }: { value: number; max: number; tone?: Tone }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--app-bg-sunken)" }}>
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: toneInk(tone) }} />
    </div>
  );
}

// ── Description list (payload key→value pairs) ─────────────────────────────────

export function FieldList({ items }: { items: Array<{ label: ReactNode; value: ReactNode }> }) {
  return (
    <dl className="grid grid-cols-[minmax(0,7rem)_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
      {items.map((it, i) => (
        <div key={i} className="contents">
          <dt className="truncate font-mono text-[11px] uppercase tracking-[0.06em]" style={{ color: "var(--app-ink-3)" }}>
            {it.label}
          </dt>
          <dd className="min-w-0 break-words" style={{ color: "var(--app-ink)" }}>
            {it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ── Disclosure (styled details/summary) ───────────────────────────────────────

export function Disclosure({ summary, children, open }: { summary: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <details className="mt-2" open={open}>
      <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--app-cool)" }}>
        {summary}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

// ── Form controls (server-action forms) ───────────────────────────────────────

const CONTROL_CLASS = "w-full rounded-[var(--app-radius-sm)] border px-3 py-2 text-[16px]";
const CONTROL_STYLE: React.CSSProperties = { borderColor: "var(--app-control-border, var(--app-border))", background: "var(--app-bg-elevated)", color: "var(--app-ink)" };

/** A labeled form field: a mono label, optional hint, and the control as children. */
export function Field({ label, hint, htmlFor, children }: { label: ReactNode; hint?: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block space-y-1">
      <span className="block font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
        {label}
      </span>
      {children}
      {hint ? <span className="block text-[11px]" style={{ color: "var(--app-ink-3)" }}>{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${CONTROL_CLASS} ${props.className ?? ""}`} style={{ ...CONTROL_STYLE, ...props.style }} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${CONTROL_CLASS} ${props.className ?? ""}`} style={{ ...CONTROL_STYLE, ...props.style }} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${CONTROL_CLASS} appearance-none ${props.className ?? ""}`} style={{ ...CONTROL_STYLE, ...props.style }} />;
}

// ── Freshness helpers ─────────────────────────────────────────────────────────

/** Hours → "17h" / "2d" for pipeline / ingest ages. */
export function fmtAge(hours: number): string {
  if (hours < 1) return "under 1h";
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

/** An ISO stamp → an age label + a fresh/aging/stale tone. */
export function ageOf(iso: string | undefined, agingDays: number, staleDays: number): { label: string; tone: Tone } {
  if (!iso) return { label: "no stamp", tone: "muted" };
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return { label: "no stamp", tone: "muted" };
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  const label = days <= 0 ? "today" : days === 1 ? "1 day old" : `${days} days old`;
  return { label, tone: days >= staleDays ? "danger" : days >= agingDays ? "warning" : "positive" };
}
