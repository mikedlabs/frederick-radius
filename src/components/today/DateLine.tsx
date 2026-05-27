import HomeMuniChip from "./HomeMuniChip";

/**
 * DateLine — slim, calm header that sits ABOVE the SkyHero on /now.
 *
 * Replaces the verbose AdaptiveGreeting (dateline + serif headline +
 * personal greeting line + interests chip) with a much quieter
 * dateline-only header. The weather has its own voice in the
 * WeatherHero card directly below; the page header doesn't need to
 * editorialize on top of that.
 *
 * Renders on the page background (paper-cream), not the sky gradient,
 * so styling can use the regular ink tokens instead of sky-toned
 * currentColor. HomeMuniChip stays — when a user has chosen their
 * home municipality during /welcome, surfacing "Your spot: Brunswick"
 * here lands the personalization as the very first thing they see on
 * the page.
 */
export default function DateLine() {
  const now = new Date();
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
  }).format(now);
  // Date — month name + day number ("May 27"). Sits in the same line
  // as the weekday so users see weekday + calendar date + clock time
  // in one glance instead of having to read the day strip below to
  // confirm the date.
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "long",
    day: "numeric",
  }).format(now);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(now);

  return (
    <header className="flex items-center justify-between gap-3">
      <p
        className="truncate text-[11px] font-medium uppercase tracking-[0.12em] sm:text-[12px]"
        style={{ color: "var(--app-ink-3)" }}
      >
        {weekday} · {date} · {time}
      </p>
      <HomeMuniChip />
    </header>
  );
}
