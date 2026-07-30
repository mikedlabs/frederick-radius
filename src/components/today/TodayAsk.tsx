import Link from "next/link";
import Form from "next/form";
import {
  ASK_COMPOSER_INPUT_CLASS,
  AskComposerFrame,
  AskComposerMark,
  AskComposerSubmit,
} from "@/components/ask/AskComposer";

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
        aria-label="Ask Radius"
        className={embedded ? "border-b py-2" : undefined}
        style={embedded ? { borderColor: "var(--app-border)" } : undefined}
      >
        <AskComposerFrame compact className="flex items-center gap-2">
          <Link
            href="/ask"
            prefetch={false}
            aria-label="Open Ask Radius"
            className="tap-44 grid h-11 w-11 shrink-0 place-items-center rounded-full"
          >
            <AskComposerMark compact />
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
            className={`${ASK_COMPOSER_INPUT_CLASS} h-11 font-medium`}
            style={{ color: "var(--app-ink)" }}
            placeholder="What do you need?"
          />
          <AskComposerSubmit />
        </AskComposerFrame>
      </Form>
    </section>
  );
}
