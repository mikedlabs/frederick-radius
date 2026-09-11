import fs from "fs";
let content = fs.readFileSync("src/app/(app)/today/page.tsx", "utf-8");
content = content.replace(
  `    return { title: "Happening now", items: [...eventsLive(now), ...inNext90] };`,
  `    const happeningNow = allEvents.filter(e => new Date(e.starts_at).getTime() <= nowMs && new Date(e.ends_at).getTime() >= nowMs);\n    // Deduplicate against inNext90 just in case\n    const nowSlugs = new Set(happeningNow.map(e => e.slug));\n    const next90Unique = inNext90.filter(e => !nowSlugs.has(e.slug));\n    return { title: "Happening now", items: [...happeningNow, ...next90Unique] };`
);
fs.writeFileSync("src/app/(app)/today/page.tsx", content);
