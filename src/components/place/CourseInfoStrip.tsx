import courseInfo from "@/data/course-info.json";
import PlaceSectionLabel, { PlaceDotList } from "./PlaceSectionLabel";

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
    <section aria-labelledby="course-info-heading" className="space-y-1">
      <PlaceSectionLabel id="course-info-heading">The course</PlaceSectionLabel>
      <PlaceDotList items={chips} className="tabular-nums" />
      {c.designer && (
        <p className="text-[14px]" style={{ color: "var(--app-ink-2)" }}>
          Designed by {c.designer}
        </p>
      )}
    </section>
  );
}
