import PlaceSectionLabel from "@/components/place/PlaceSectionLabel";
import { cliffNotesFor, type CNFact } from "@/lib/loaders/townCliffNotes";

/**
 * TownAlmanac: the verified "cliff notes" for a town, at the top of its
 * page: a one-liner on its character, a quick FAQ (collapsible), fun
 * facts, and the best local insights. This is the informative town context
 * (replaces leaning on the reader's geolocation). Server-rendered; the FAQ
 * uses native <details> so it needs no client JS. Sourced + verified.
 *
 * Plain tool treatment: the shared 13px uppercase section label, the checked
 * date as plain muted meta, the one-liner in system sans and the disclosure
 * in link text. Every text color is a theme-readable token, so dark
 * appearance reads as well as light.
 */

function SourceLink({ href }: { href?: string }) {
  if (!href) return null;
  let host = "";
  try {
    host = new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="tap-44 ml-1 inline-flex items-center text-[12px] underline decoration-dotted underline-offset-2"
      style={{ color: "var(--app-ink-3)" }}
      aria-label={`Source: ${host}`}
    >
      {host}
    </a>
  );
}

function FactList({ items, accent }: { items: CNFact[]; accent?: boolean }) {
  return (
    <ul className="space-y-2">
      {items.map((f, i) => (
        <li key={i} className="flex gap-2.5 text-[13px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
          <span
            aria-hidden
            className="mt-[7px] h-1 w-1 shrink-0 rounded-full"
            style={{ background: accent ? "var(--app-brand)" : "var(--app-ink-3)" }}
          />
          <span className="min-w-0 max-w-[68ch]">
            {f.text}
            <SourceLink href={f.source_url} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A sub-label inside the disclosure: plain sentence-case text, so it never
 * competes with the section label above it. */
function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-[0.875rem] font-semibold leading-snug" style={{ color: "var(--app-ink-2)" }}>
      {children}
    </p>
  );
}

export default function TownAlmanac({ slug, townName }: { slug: string; townName: string }) {
  const cn = cliffNotesFor(slug);
  if (!cn) return null;

  return (
    <section
      aria-label={`Cliff notes on ${townName}`}
      className="border-y py-4"
      style={{ borderColor: "var(--app-border)" }}
    >
      {/* Wraps so the date drops under the label at 320px with large text. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <PlaceSectionLabel as="h2">Town notes</PlaceSectionLabel>
        {cn.last_verified && (
          <span className="text-[0.8125rem] leading-tight" style={{ color: "var(--app-ink-3)" }}>
            Checked {cn.last_verified}
          </span>
        )}
      </div>

      {cn.one_liner && (
        <p className="mt-2.5 max-w-[68ch] text-[1.125rem] leading-snug" style={{ color: "var(--app-ink)" }}>
          {cn.one_liner}
        </p>
      )}

      {(cn.insights?.length || cn.fun_facts?.length || cn.faq?.length) ? (
        <details className="group/more mt-3 border-t" style={{ borderColor: "var(--app-border)" }}>
          <summary className="tap-44 flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-semibold [&::-webkit-details-marker]:hidden" style={{ color: "var(--app-link)" }}>
            More about {townName}
            <span aria-hidden className="shrink-0 text-[16px] leading-none transition-transform group-open/more:rotate-45 motion-reduce:transition-none" style={{ color: "var(--app-ink-3)" }}>+</span>
          </summary>
          <div className="space-y-3.5 pt-2">
          {cn.insights && cn.insights.length > 0 && (
            <div>
              <Label>Local insight</Label>
              <FactList items={cn.insights} accent />
            </div>
          )}

          {cn.fun_facts && cn.fun_facts.length > 0 && (
            <div>
              <Label>Fun facts</Label>
              <FactList items={cn.fun_facts} />
            </div>
          )}

          {cn.faq && cn.faq.length > 0 && (
            <div>
              <Label>Good to know</Label>
              <ul className="space-y-1">
                {cn.faq.map((item, i) => (
                  <li key={i}>
                    <details className="group/faq border-t pt-1.5" style={{ borderColor: "var(--app-border)" }}>
                      <summary
                        className="tap-44 flex cursor-pointer list-none items-center justify-between gap-2 py-1 text-[13px] font-medium marker:hidden"
                        style={{ color: "var(--app-ink)" }}
                      >
                        {item.q}
                        <span aria-hidden className="shrink-0 text-[14px] leading-none transition-transform group-open/faq:rotate-45 motion-reduce:transition-none" style={{ color: "var(--app-ink-3)" }}>
                          +
                        </span>
                      </summary>
                      <p className="max-w-[68ch] pb-1.5 text-[13px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
                        {item.a}
                        <SourceLink href={item.source_url} />
                      </p>
                    </details>
                  </li>
                ))}
              </ul>
            </div>
          )}
          </div>
        </details>
      ) : null}
    </section>
  );
}
