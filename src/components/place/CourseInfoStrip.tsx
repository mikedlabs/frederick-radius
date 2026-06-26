import courseInfo from "@/data/course-info.json";

/**
 * CourseInfoStrip — rolls curated golf-course facts (holes, par, access,
 * designer, on-site amenities) onto a golf place detail page. Keyed by slug
 * (src/data/course-info.json). Renders nothing unless this place has course
 * info, so it's safe to drop on every place. Mirrors ParkAmenitiesStrip.
 */

type CourseInfo = {
  holes?: number;
  par?: number;
  access?: "public" | "municipal" | "private";
  designer?: string;
  drivingRange?: boolean;
  restaurant?: boolean;
  lessons?: boolean;
};

const MAP = courseInfo as Record<string, CourseInfo>;

const ACCESS_LABEL: Record<string, string> = {
  public: "Public",
  municipal: "Municipal",
  private: "Private / members",
};

export default function CourseInfoStrip({ slug }: { slug: string }) {
  const c = MAP[slug];
  if (!c) return null;

  const chips: string[] = [];
  if (c.holes && c.par) chips.push(`${c.holes} holes · Par ${c.par}`);
  else if (c.holes) chips.push(`${c.holes} holes`);
  if (c.access) chips.push(ACCESS_LABEL[c.access] ?? c.access);
  if (c.drivingRange) chips.push("Driving range");
  if (c.restaurant) chips.push("On-site restaurant");
  if (c.lessons) chips.push("Lessons");
  if (chips.length === 0) return null;

  return (
    <section
      className="rounded-[var(--app-radius-lg)] border p-4"
      style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }}
    >
      <h2 className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
        The course
      </h2>
      <ul className="mt-2.5 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <li
            key={chip}
            className="inline-flex items-center rounded-full border px-3 py-1.5 text-[13px] font-medium tabular-nums"
            style={{ borderColor: "var(--app-border)", background: "var(--app-bg-sunken)", color: "var(--app-ink-2)" }}
          >
            {chip}
          </li>
        ))}
      </ul>
      {c.designer && (
        <p className="mt-2.5 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
          Designed by {c.designer}
        </p>
      )}
    </section>
  );
}
