import Link from "next/link";
import Form from "next/form";
import { ArrowRight, MessageCircleQuestion } from "lucide-react";

/**
 * A compact front-door launcher for the full Ask Radius workspace.
 *
 * Today should help someone start a question without turning the daily
 * briefing into a chat transcript. Next's progressive form keeps its native
 * GET fallback before JavaScript loads, then uses in-app navigation once the
 * page is interactive.
 */
export default function TodayAsk({ embedded = false }: { embedded?: boolean }) {
  return (
    <section
      id="ask-radius"
      aria-labelledby="today-ask-heading"
      data-surface-row={embedded ? "ask" : undefined}
      className={embedded ? "scroll-mt-24" : "mt-3 scroll-mt-24"}
    >
      <h2 id="today-ask-heading" className="sr-only">
        Ask Radius
      </h2>
      {/* One query band, set like the first line of a field-guide index. */}
      <Form
        action="/ask"
        role="search"
        className={`group flex min-h-[58px] items-center gap-2.5 overflow-hidden px-1.5 transition focus-within:bg-[var(--app-bg-elevated-solid)] ${
          embedded ? "border-b" : "border-y border-l-2"
        }`}
        style={{
          borderColor: "color-mix(in srgb, var(--app-brand) 52%, var(--app-border))",
          background: "color-mix(in srgb, var(--app-brand) 4%, transparent)",
          boxShadow: embedded ? "inset 3px 0 0 var(--app-brand)" : undefined,
        }}
      >
        <Link
          href="/ask"
          prefetch={false}
          aria-label="Open Ask Radius"
          className="tap-44 flex shrink-0 items-center gap-2 px-1 font-semibold"
          style={{ color: "var(--app-ink)" }}
        >
          <span
            aria-hidden
            className="grid h-9 w-9 place-items-center rounded-[var(--app-radius-sm)]"
            style={{ color: "var(--app-on-brand)", background: "var(--app-brand)" }}
          >
            <MessageCircleQuestion className="h-[19px] w-[19px]" strokeWidth={2.25} />
          </span>
          <span className="text-[13px] font-bold leading-none">Ask</span>
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
          placeholder="What do you need?"
        />
        <button
          type="submit"
          aria-label="Ask Radius"
          className="tap-44 grid h-11 w-11 shrink-0 place-items-center rounded-[var(--app-radius-sm)] transition active:scale-[0.97]"
          style={{ background: "var(--app-brand)", color: "var(--app-on-brand)" }}
        >
          <ArrowRight className="h-[19px] w-[19px]" strokeWidth={2.5} aria-hidden />
        </button>
      </Form>
    </section>
  );
}
