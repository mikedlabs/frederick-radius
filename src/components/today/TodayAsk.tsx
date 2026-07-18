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
      <form
        action="/ask"
        method="get"
        role="search"
        className="group flex min-h-14 items-center gap-2 overflow-hidden rounded-[var(--app-radius-lg)] border border-[var(--app-border)] bg-[var(--app-bg-elevated)] px-2 shadow-[var(--app-shadow-1)] transition focus-within:border-[var(--app-brand)] focus-within:shadow-[var(--app-shadow-2)]"
      >
        <Link
          href="/ask"
          prefetch={false}
          aria-label="Open Ask Radius"
          className="tap-44 flex shrink-0 items-center gap-2 rounded-full px-1.5 font-semibold"
          style={{ color: "var(--app-ink)" }}
        >
          <span
            aria-hidden
            className="grid h-8 w-8 place-items-center rounded-full"
            style={{
              color: "var(--app-brand-press)",
              background: "color-mix(in srgb, var(--app-brand) 12%, transparent)",
            }}
          >
            <MessageCircleQuestion className="h-[18px] w-[18px]" strokeWidth={2} />
          </span>
          <span className="text-[12px] leading-none sm:text-[13px]">Ask Radius</span>
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
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[var(--app-ink-3)]"
          style={{ color: "var(--app-ink)" }}
          placeholder="What do you need?"
        />
        <button
          type="submit"
          aria-label="Ask Radius"
          className="tap-44 grid h-10 w-10 shrink-0 place-items-center rounded-full text-[var(--app-brand-press)] transition group-focus-within:bg-[var(--app-brand)] group-focus-within:text-white active:scale-95"
        >
          <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
        </button>
      </form>
    </section>
  );
}
