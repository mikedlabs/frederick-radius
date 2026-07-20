import Link from "next/link";
import { ArrowRight, MessageCircleQuestion } from "lucide-react";

/**
 * A compact front-door launcher for the full Ask Radius workspace.
 *
 * Today should help someone start a question without turning the daily
 * briefing into a chat transcript. This native GET form works before client
 * JavaScript loads and hands the dedicated page its `q` search parameter.
 */
export default function TodayAsk() {
  return (
    <section
      id="ask-radius"
      aria-labelledby="today-ask-heading"
      className="mt-3 scroll-mt-24"
    >
      <h2 id="today-ask-heading" className="sr-only">
        Ask Radius
      </h2>
      {/* Ask Radius is the flagship tool, so it wears the signal vermilion and
          reads as the ONE primary action below the weather (owner: "ask radius
          should be more important visually"): a brand-tinted frame, a filled
          vermilion mark + submit, and a bold label. */}
      <form
        action="/ask"
        method="get"
        role="search"
        className="group flex min-h-[60px] items-center gap-2.5 overflow-hidden rounded-[var(--app-radius-lg)] border px-2.5 transition focus-within:shadow-[var(--app-shadow-2)]"
        style={{
          borderColor: "color-mix(in srgb, var(--app-brand) 38%, var(--app-border))",
          background: "color-mix(in srgb, var(--app-brand) 6%, var(--app-bg-elevated))",
          boxShadow: "var(--app-shadow-1)",
        }}
      >
        <Link
          href="/ask"
          prefetch={false}
          aria-label="Open Ask Radius"
          className="tap-44 flex shrink-0 items-center gap-2 rounded-full px-1 font-semibold"
          style={{ color: "var(--app-ink)" }}
        >
          <span
            aria-hidden
            className="grid h-9 w-9 place-items-center rounded-full shadow-[var(--app-shadow-1)]"
            style={{ color: "var(--app-on-brand)", background: "var(--app-brand)" }}
          >
            <MessageCircleQuestion className="h-[19px] w-[19px]" strokeWidth={2.25} />
          </span>
          <span className="text-[13px] font-bold leading-none">Ask Radius</span>
        </Link>

        <label htmlFor="today-ask-query" className="sr-only">
          What would you like help deciding?
        </label>
        <input
          id="today-ask-query"
          name="q"
          type="search"
          maxLength={300}
          enterKeyHint="go"
          autoComplete="off"
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] font-medium outline-none placeholder:font-normal placeholder:text-[var(--app-ink-3)]"
          style={{ color: "var(--app-ink)" }}
          placeholder="Ask anything about Frederick"
        />
        <button
          type="submit"
          aria-label="Ask Radius"
          className="tap-44 grid h-11 w-11 shrink-0 place-items-center rounded-full transition active:scale-95"
          style={{ background: "var(--app-brand)", color: "var(--app-on-brand)" }}
        >
          <ArrowRight className="h-[19px] w-[19px]" strokeWidth={2.5} aria-hidden />
        </button>
      </form>
    </section>
  );
}
