import Image from "next/image";
import {
  Radio,
  MoonStar,
  Sunrise,
  ArrowUpRight,
  MapPin,
  Clock3,
  Navigation,
  Ticket,
} from "lucide-react";
import { EVENTS } from "./data";
import { PAPER_CREAM_BLUR } from "@/lib/blur-placeholder";

/**
 * EventsMock — "What's on, by the hour."
 *
 * TIME is the spine. A vertical timeline rail runs down the left edge and
 * the screen descends through three temporal movements — Happening now,
 * Tonight, This weekend — each pinned to a glowing node on the rail with
 * its own clock iconography (radio → moon → sunrise). The "now" beat is a
 * full-bleed live hero; tonight is a horizontal snap rail; the weekend is
 * a stacked magazine spread. The descending arc of icons makes the
 * passage of the day the literal structure of the page.
 */

const DEPTH =
  "0 1px 2px rgba(26,24,21,0.05), 0 22px 48px -24px rgba(26,24,21,0.30)";
const DISPLAY = { fontFamily: "var(--font-display), Georgia, serif" } as const;

// Sequenced by time-of-day. EVENTS = [Alive@Five, Sky Stage, Festival, Color on the Creek]
const now = EVENTS[0]; // Tonight 5:00 PM — the live beat
const tonight = [EVENTS[1], EVENTS[3]]; // later tonight / evening
const weekend = [EVENTS[2], EVENTS[3]]; // Sat morning + Sun evening

export default function EventsMock() {
  return (
    <div
      className="relative mx-auto min-h-screen w-full max-w-[440px] overflow-hidden"
      style={{ background: "var(--app-bg)" }}
    >
      {/* ===== Sticky header: the live clock ===== */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between px-5 pb-3 pt-5"
        style={{
          background:
            "linear-gradient(var(--app-bg) 62%, color-mix(in srgb, var(--app-bg) 0%, transparent))",
        }}
      >
        <div>
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: "var(--app-ink-3)" }}
          >
            What&apos;s on
          </p>
          <h1
            className="mt-0.5 text-[27px] leading-none tracking-tight"
            style={{ ...DISPLAY, color: "var(--app-ink)" }}
          >
            By the hour
          </h1>
        </div>
        <div
          className="flex items-center gap-2 rounded-full px-3 py-1.5"
          style={{
            background: "var(--app-bg-elevated-solid)",
            border: "1px solid var(--app-border)",
            boxShadow: DEPTH,
          }}
        >
          <span className="relative flex h-2 w-2" aria-hidden>
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70"
              style={{ background: "var(--app-brand)" }}
            />
            <span
              className="relative inline-flex h-2 w-2 rounded-full"
              style={{ background: "var(--app-brand)" }}
            />
          </span>
          <span
            className="text-[12px] font-semibold tabular-nums"
            style={{ color: "var(--app-ink-2)" }}
          >
            4:58 PM
          </span>
        </div>
      </header>

      {/* ===== The timeline: a rail down the left, movements down the page ===== */}
      <div className="relative pb-14">
        {/* the spine */}
        <span
          aria-hidden
          className="absolute bottom-24 left-[31px] top-2 w-px"
          style={{
            background:
              "linear-gradient(var(--app-brand), var(--app-cool) 42%, var(--app-accent) 78%, var(--app-border))",
            opacity: 0.5,
          }}
        />

        {/* ---------- MOVEMENT 1 · HAPPENING NOW ---------- */}
        <Marker
          icon={<Radio className="h-3.5 w-3.5" strokeWidth={2.5} />}
          tint="var(--app-brand)"
          kicker="Right now"
          count="1 live"
          live
        />
        <section className="relative pl-[52px] pr-5">
          <article
            className="relative overflow-hidden rounded-[26px]"
            style={{ boxShadow: DEPTH }}
          >
            <span className="relative block aspect-[4/5] w-full overflow-hidden">
              <Image
                src={now.photo}
                alt={`${now.title} at ${now.venue}`}
                fill
                sizes="400px"
                placeholder="blur"
                blurDataURL={PAPER_CREAM_BLUR}
                className="object-cover"
                priority
              />
              {/* cinematic wash */}
              <span
                aria-hidden
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to top, rgba(20,16,12,0.86) 4%, rgba(20,16,12,0.28) 42%, rgba(20,16,12,0.08) 70%)",
                }}
              />
              {/* top chips */}
              <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white backdrop-blur-md"
                  style={{ background: "color-mix(in srgb, var(--app-brand) 88%, transparent)" }}
                >
                  <span className="relative flex h-1.5 w-1.5" aria-hidden>
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-80" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                  </span>
                  On now
                </span>
                <span
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-white/90 backdrop-blur-md"
                  style={{ background: "rgba(20,16,12,0.34)" }}
                >
                  {now.category}
                </span>
              </div>
              {/* the headline content */}
              <div className="absolute inset-x-0 bottom-0 p-5">
                <div className="flex items-center gap-1.5 text-[12px] font-medium text-white/80">
                  <Clock3 className="h-3.5 w-3.5" aria-hidden />
                  <span>Started {now.time}</span>
                  <span aria-hidden>·</span>
                  <span>ends ~8 PM</span>
                </div>
                <h2
                  className="mt-1.5 text-[34px] leading-[0.96] text-white"
                  style={DISPLAY}
                >
                  {now.title}
                </h2>
                <p className="mt-2 flex items-center gap-1.5 text-[13px] text-white/85">
                  <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {now.venue}
                </p>
                <div className="mt-4 flex items-center gap-2.5">
                  <span
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-3 text-[14px] font-semibold"
                    style={{ background: "#fff", color: "var(--app-ink)" }}
                  >
                    <Navigation className="h-4 w-4" aria-hidden />
                    Walk there · 4 min
                  </span>
                  <span
                    className="inline-flex h-12 w-12 items-center justify-center rounded-full text-white"
                    style={{ background: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.3)" }}
                    aria-hidden
                  >
                    <ArrowUpRight className="h-5 w-5" />
                  </span>
                </div>
              </div>
            </span>
          </article>
        </section>

        {/* ---------- MOVEMENT 2 · TONIGHT (horizontal snap rail) ---------- */}
        <Marker
          icon={<MoonStar className="h-3.5 w-3.5" strokeWidth={2.5} />}
          tint="var(--app-cool)"
          kicker="Tonight"
          count={`${tonight.length} after dark`}
        />
        <section className="relative mt-1">
          <div
            className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 pl-[52px] pr-5"
            style={{ scrollbarWidth: "none" }}
          >
            {tonight.map((ev, i) => (
              <article
                key={ev.title}
                className="relative w-[208px] shrink-0 snap-start overflow-hidden rounded-[22px]"
                style={{
                  background: "var(--app-bg-elevated-solid)",
                  border: "1px solid var(--app-border)",
                  boxShadow: DEPTH,
                }}
              >
                <span className="relative block h-40 w-full overflow-hidden">
                  <Image
                    src={ev.photo}
                    alt={`${ev.title} at ${ev.venue}`}
                    fill
                    sizes="208px"
                    placeholder="blur"
                    blurDataURL={PAPER_CREAM_BLUR}
                    className="object-cover"
                  />
                  <span
                    aria-hidden
                    className="absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(to top, rgba(20,16,12,0.5), transparent 58%)",
                    }}
                  />
                  {/* time pill — big, the protagonist */}
                  <span
                    className="absolute left-3 top-3 inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-bold text-white backdrop-blur-md"
                    style={{ background: `color-mix(in srgb, ${ev.color} 86%, transparent)` }}
                  >
                    {ev.time}
                  </span>
                </span>
                <div className="p-3.5">
                  <span
                    className="text-[10px] font-bold uppercase tracking-[0.14em]"
                    style={{ color: ev.color }}
                  >
                    {ev.category}
                  </span>
                  <h3
                    className="mt-1 text-[18px] leading-[1.02]"
                    style={{ ...DISPLAY, color: "var(--app-ink)" }}
                  >
                    {ev.title}
                  </h3>
                  <p
                    className="mt-1.5 flex items-center gap-1 text-[12px]"
                    style={{ color: "var(--app-ink-3)" }}
                  >
                    <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                    <span className="truncate">{ev.venue}</span>
                  </p>
                </div>
                {/* index node tying card to the rail order */}
                <span
                  aria-hidden
                  className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold tabular-nums text-white backdrop-blur-md"
                  style={{ background: "rgba(20,16,12,0.4)" }}
                >
                  {i + 1}
                </span>
              </article>
            ))}
            {/* tail: full schedule */}
            <a
              className="flex w-[120px] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-[22px] text-center"
              href="#"
              style={{
                background: "var(--app-cool-tint-6)",
                border: "1px dashed var(--app-border)",
              }}
            >
              <span
                className="flex h-10 w-10 items-center justify-center rounded-full"
                style={{ background: "var(--app-bg-elevated-solid)", boxShadow: DEPTH }}
              >
                <ArrowUpRight className="h-4 w-4" style={{ color: "var(--app-cool)" }} aria-hidden />
              </span>
              <span
                className="text-[12px] font-semibold leading-tight"
                style={{ color: "var(--app-cool)" }}
              >
                Full
                <br />
                tonight
              </span>
            </a>
          </div>
        </section>

        {/* ---------- MOVEMENT 3 · THIS WEEKEND (stacked spread) ---------- */}
        <Marker
          icon={<Sunrise className="h-3.5 w-3.5" strokeWidth={2.5} />}
          tint="var(--app-accent)"
          kicker="This weekend"
          count="Sat–Sun"
        />
        <section className="relative space-y-3 pl-[52px] pr-5">
          {/* lead: wide aerial banner for Saturday's festival */}
          <article
            className="relative overflow-hidden rounded-[24px]"
            style={{ boxShadow: DEPTH }}
          >
            <span className="relative block h-48 w-full overflow-hidden">
              <Image
                src={weekend[0].photo}
                alt={`${weekend[0].title}, ${weekend[0].venue} from above`}
                fill
                sizes="400px"
                placeholder="blur"
                blurDataURL={PAPER_CREAM_BLUR}
                className="object-cover"
              />
              <span
                aria-hidden
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(110deg, rgba(20,16,12,0.78) 6%, rgba(20,16,12,0.2) 52%, transparent 80%)",
                }}
              />
              <div className="absolute inset-y-0 left-0 flex max-w-[72%] flex-col justify-center p-5">
                <span
                  className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white backdrop-blur-md"
                  style={{ background: `color-mix(in srgb, ${weekend[0].color} 88%, transparent)` }}
                >
                  Sat · {weekend[0].time}
                </span>
                <h3
                  className="mt-2 text-[26px] leading-[0.98] text-white"
                  style={DISPLAY}
                >
                  {weekend[0].title}
                </h3>
                <p className="mt-1.5 flex items-center gap-1 text-[12px] text-white/85">
                  <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                  {weekend[0].venue}
                </p>
              </div>
            </span>
          </article>

          {/* Sunday — compact ticket-style row */}
          <article
            className="relative flex items-stretch gap-3.5 overflow-hidden rounded-[20px] p-3"
            style={{
              background: "var(--app-bg-elevated-solid)",
              border: "1px solid var(--app-border)",
              boxShadow: DEPTH,
            }}
          >
            <span className="relative block h-[88px] w-[88px] shrink-0 overflow-hidden rounded-[14px]">
              <Image
                src={weekend[1].photo}
                alt={`${weekend[1].title} at ${weekend[1].venue}`}
                fill
                sizes="88px"
                placeholder="blur"
                blurDataURL={PAPER_CREAM_BLUR}
                className="object-cover"
              />
            </span>
            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]"
                  style={{ background: `color-mix(in srgb, ${weekend[1].color} 16%, transparent)`, color: weekend[1].color }}
                >
                  Sun · {weekend[1].time}
                </span>
                <span className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
                  {weekend[1].category}
                </span>
              </div>
              <h3
                className="mt-1 truncate text-[19px] leading-tight"
                style={{ ...DISPLAY, color: "var(--app-ink)" }}
              >
                {weekend[1].title}
              </h3>
              <p
                className="mt-0.5 flex items-center gap-1 text-[12px]"
                style={{ color: "var(--app-ink-3)" }}
              >
                <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{weekend[1].venue}</span>
              </p>
            </div>
            <span
              className="flex w-11 shrink-0 items-center justify-center rounded-[14px]"
              style={{ background: "var(--app-accent-tint-12, color-mix(in srgb, var(--app-accent) 12%, transparent))" }}
              aria-hidden
            >
              <Ticket className="h-5 w-5" style={{ color: "var(--app-accent)" }} />
            </span>
          </article>
        </section>

        {/* end-of-day cap */}
        <div className="relative mt-7 flex items-center justify-center gap-2">
          <span
            className="text-[12px] font-medium"
            style={{ color: "var(--app-ink-3)" }}
          >
            That&apos;s the day in Frederick.
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Timeline marker (the rail node + section label) ---------- */
function Marker({
  icon,
  tint,
  kicker,
  count,
  live = false,
}: {
  icon: React.ReactNode;
  tint: string;
  kicker: string;
  count: string;
  live?: boolean;
}) {
  return (
    <div className="relative mb-3 mt-7 flex items-center gap-3 pl-[14px] pr-5">
      {/* node on the rail */}
      <span className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center">
        {live && (
          <span
            aria-hidden
            className="absolute inline-flex h-9 w-9 animate-ping rounded-full opacity-30"
            style={{ background: tint }}
          />
        )}
        <span
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-white"
          style={{ background: tint, boxShadow: DEPTH }}
        >
          {icon}
        </span>
      </span>
      <div className="flex flex-1 items-baseline justify-between">
        <h2
          className="text-[20px] leading-none tracking-tight"
          style={{ ...DISPLAY, color: "var(--app-ink)" }}
        >
          {kicker}
        </h2>
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.12em]"
          style={{ color: tint }}
        >
          {count}
        </span>
      </div>
    </div>
  );
}
