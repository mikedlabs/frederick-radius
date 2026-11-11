import type { ReactNode } from "react";

/**
 * The place page's section label: 13px uppercase system sans with open
 * letter spacing in the muted ink. Type carries the break between sections;
 * the page draws one hairline between them, so a label never brings its own
 * rule, tick or box.
 */
export const PLACE_SECTION_LABEL_CLASS =
  "text-[13px] font-semibold uppercase leading-tight tracking-[0.1em]";

export default function PlaceSectionLabel({
  as: Tag = "h2",
  id,
  className = "",
  children,
}: {
  as?: "h2" | "h3" | "p";
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag
      id={id}
      className={`${PLACE_SECTION_LABEL_CLASS}${className ? ` ${className}` : ""}`}
      style={{ color: "var(--app-ink-3)" }}
    >
      {children}
    </Tag>
  );
}

/**
 * Informational items (what a place is known for, who it suits) read as one
 * line of ink text with the items separated by a middle dot. They are facts,
 * not controls, so they are never drawn as capsules. Each separator is bound
 * to the item before it with a no-break space, so a wrapped line never starts
 * with a dot.
 */
export function PlaceDotList({
  items,
  label,
  className = "",
}: {
  items: readonly string[];
  /** Accessible name for the list, when the visible label is not adjacent. */
  label?: string;
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <ul
      aria-label={label}
      className={`text-[15px] leading-relaxed${className ? ` ${className}` : ""}`}
      style={{ color: "var(--app-ink)" }}
    >
      {items.map((item, i) => (
        <li key={item} className="inline">
          {item}
          {i < items.length - 1 ? (
            <>
              <span aria-hidden style={{ color: "var(--app-ink-3)" }}>{" ·"}</span>{" "}
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
