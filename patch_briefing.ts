import fs from "fs";

let content = fs.readFileSync("src/components/today/BriefingLine.tsx", "utf-8");

// We will overwrite BriefingLine.tsx with an AI-driven approach.
const newBriefingLine = `import { PLACES } from "@/data/places";
import { allUpcoming, eventsLive } from "@/lib/loaders/events";
import { getOpenStatus } from "@/lib/hours";
import { getNwsForecast } from "@/lib/integrations/nws";
import { FREDERICK_CENTER } from "@/lib/geo";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { unstable_cache } from "next/cache";

type TimeBand = "morning" | "midday" | "afternoon" | "evening" | "late";

function timeBand(now: Date): TimeBand {
  const local = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const h = local.getHours();
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 14) return "midday";
  if (h >= 14 && h < 17) return "afternoon";
  if (h >= 17 && h < 22) return "evening";
  return "late";
}

function openNowCount(now: Date): number {
  let n = 0;
  for (const p of PLACES) {
    if (p.source !== "seed" && p.source !== "manual") continue;
    if (!p.hours) continue;
    const status = getOpenStatus(p.hours, { verified: true }, now);
    if (status?.state === "open" || status?.state === "closing-soon") n++;
  }
  return n;
}

function nextNotableEvent(now: Date) {
  const live = eventsLive(now);
  if (live.length > 0) return { event: live[0], live: true };
  const horizon = now.getTime() + 5 * 3600_000;
  const soon = allUpcoming(now)
    .filter((e) => {
      const t = Date.parse(e.starts_at);
      return Number.isFinite(t) && t > now.getTime() && t < horizon;
    })
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  return soon.length > 0 ? { event: soon[0], live: false } : null;
}

// Caching the AI response by hour to prevent cost spikes
const getAiBriefing = unstable_cache(
  async (time: string, weather: string, openPlaces: number, eventSummary: string) => {
    try {
      const { text } = await generateText({
        model: openai("gpt-4o-mini"),
        system: "You are a friendly, hyper-local guide for Frederick County, MD. Your job is to write a single-sentence daily briefing for the user based on the time of day, weather, open places, and next big event. Keep it under 20 words. No emojis.",
        prompt: \`Write a one sentence briefing given these facts: Time: \${time}, Weather: \${weather}, \${openPlaces} places open, Next Event: \${eventSummary}.\`
      });
      return text;
    } catch (e) {
      console.error("AI Briefing failed", e);
      return null;
    }
  },
  ['ai-briefing-line'],
  { revalidate: 3600 }
);

export default async function BriefingLine() {
  const now = new Date();
  const band = timeBand(now);
  const openCount = openNowCount(now);
  const next = nextNotableEvent(now);
  
  let weatherSummary = "clear";
  try {
    const fc = await getNwsForecast(FREDERICK_CENTER);
    if (fc && fc.hourly.length > 0) {
       weatherSummary = \`\${fc.hourly[0].temperature}°F and \${fc.hourly[0].shortForecast}\`;
    }
  } catch (e) {
    // Ignore weather failure
  }

  let eventSummary = "None soon";
  if (next) {
    eventSummary = \`'\${next.event.title}' is \${next.live ? 'happening now' : 'coming up soon'}\`;
  }

  const aiText = await getAiBriefing(band, weatherSummary, openCount, eventSummary);

  if (!aiText) {
    return (
      <p className="text-[12px] font-medium leading-snug" style={{ color: "var(--app-ink-3)" }}>
        <span style={{ color: "var(--app-ink-2)" }}>Frederick, MD.</span> Explore the calendar below.
      </p>
    );
  }

  return (
    <p
      className="text-[12px] font-medium leading-snug"
      style={{ color: "var(--app-ink-3)" }}
      aria-label="Daily briefing"
    >
      <span style={{ color: "var(--app-ink-2)" }}>{aiText}</span>
    </p>
  );
}
`;

fs.writeFileSync("src/components/today/BriefingLine.tsx", newBriefingLine);
console.log("Patched BriefingLine.tsx with AI integration");
