/**
 * The almanac line. One monospace line of the day's facts, set under the
 * masthead. It is the signature element that makes data read as an almanac
 * rather than as app chrome: sunset, the open count, the lead event. It
 * changes through the day, which is the product's reason to be opened daily.
 *
 * Pure presentation. The caller assembles the facts from the real loaders.
 */
export default function AlmanacLine({ facts }: { facts: string[] }) {
  return (
    <p
      className="lab-a-mono px-[var(--a-gutter)] pt-3 uppercase tracking-[0.13em]"
      style={{ fontSize: "var(--a-size-data)", color: "var(--a-ink-2)" }}
    >
      {facts.map((f, i) => (
        <span key={i}>
          {i > 0 && <span style={{ color: "var(--a-ink-3)" }}>{"  ·  "}</span>}
          {f}
        </span>
      ))}
    </p>
  );
}
