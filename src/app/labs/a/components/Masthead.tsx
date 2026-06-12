import Link from "next/link";

/**
 * The masthead and the constant band. Every screen opens with the same
 * fixed head: the product name set small in the data face, an optional
 * back affordance, then the unbroken ink band. The band is the wayfinding
 * signature, so it never changes weight or breaks across screens.
 */
export default function Masthead({
  back,
  kicker = "FREDERICK RADIUS",
}: {
  back?: { href: string; label: string };
  kicker?: string;
}) {
  return (
    <header className="px-[var(--a-gutter)] pt-5">
      <div className="flex items-baseline justify-between">
        <span
          className="lab-a-mono uppercase tracking-[0.22em]"
          style={{ fontSize: "var(--a-size-data)", color: "var(--a-ink)" }}
        >
          {kicker}
        </span>
        {back ? (
          <Link
            href={back.href}
            className="lab-a-mono uppercase tracking-[0.18em]"
            style={{ fontSize: "var(--a-size-data)", color: "var(--a-ink-3)" }}
          >
            {back.label}
          </Link>
        ) : (
          <span
            className="lab-a-mono uppercase tracking-[0.18em]"
            style={{ fontSize: "var(--a-size-data)", color: "var(--a-ink-3)" }}
          >
            No. 01
          </span>
        )}
      </div>
      <div className="lab-a-band mt-4" />
    </header>
  );
}
