import { cliffNotesFor, type CNFact } from "@/lib/loaders/townCliffNotes";

/**
 * TownAlmanac — the verified "cliff notes" for a town, at the top of its
 * page: a one-liner on its character, a quick FAQ (collapsible), fun
 * facts, and the best local insights. This is the informative town context
 * (replaces leaning on the reader's geolocation). Server-rendered; the FAQ
 * uses native <details> so it needs no client JS. Sourced + verified.
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
      className="tap-44 ml-1 inline-flex translate-y-[1px] items-center font-mono text-[9.5px] uppercase tracking-[0.06em] underline decoration-dotted underline-offset-2"
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
          <span className="min-w-0">
            {f.text}
            <SourceLink href={f.source_url} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em]" style={{ color: "var(--app-ink-3)" }}>
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
      className="relative overflow-hidden rounded-[var(--app-radius-lg)] border bg-[var(--app-bg-elevated)] p-4"
      style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)" }}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--app-brand)" }}>
          Cliff notes
        </span>
        <span aria-hidden className="h-px flex-1" style={{ background: "var(--app-border)" }} />
        {cn.last_verified && (
          <span className="font-mono text-[9.5px] uppercase tracking-[0.08em]" style={{ color: "var(--app-positive)" }}>
            verified
          </span>
        )}
      </div>

      {cn.one_liner && (
        <p className="mt-2.5 font-serif text-[18px] leading-snug" style={{ color: "var(--app-ink)" }}>
          {cn.one_liner}
        </p>
      )}

      {(cn.insights?.length || cn.fun_facts?.length || cn.faq?.length) && (
        <div className="mt-3.5 space-y-3.5">
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
                    <details className="group border-t pt-1.5" style={{ borderColor: "var(--app-border)" }}>
                      <summary
                        className="tap-44 flex cursor-pointer list-none items-center justify-between gap-2 py-1 text-[13px] font-medium marker:hidden"
                        style={{ color: "var(--app-ink)" }}
                      >
                        {item.q}
                        <span aria-hidden className="shrink-0 font-mono text-[14px] leading-none transition-transform group-open:rotate-45" style={{ color: "var(--app-ink-3)" }}>
                          +
                        </span>
                      </summary>
                      <p className="pb-1.5 text-[13px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
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
      )}
    </section>
  );
}
