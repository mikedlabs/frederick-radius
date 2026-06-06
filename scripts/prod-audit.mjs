/**
 * Production acceptance audit — tests the LIVE site, not a local build.
 *
 * Why this exists: "merged + preview-green" is not "verified in production."
 * This hits the real URL and asserts the trust/visual bar that the merged
 * work is supposed to meet. Run it against prod (or any deployment):
 *
 *   BASE_URL=https://frederickradius.app node scripts/prod-audit.mjs
 *
 * The headline check reads production's DEPLOYED COMMIT from /sw.js
 * (CACHE_VERSION embeds VERCEL_GIT_COMMIT_SHA), so you can tell instantly
 * whether prod is running latest main or a stale build. Pass EXPECTED_SHA
 * to assert a specific commit:
 *
 *   BASE_URL=https://frederickradius.app EXPECTED_SHA=$(git rev-parse HEAD) node scripts/prod-audit.mjs
 */
const BASE = (process.env.BASE_URL || "https://frederickradius.app").replace(/\/$/, "");
const EXPECTED_SHA = process.env.EXPECTED_SHA?.slice(0, 12) || null;

let failures = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { failures++; console.log(`  ✗ ${m}`); };

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { "User-Agent": "fr-prod-audit" } });
  return { status: res.status, html: await res.text() };
}
// Count only RENDERED <img> tags whose src is an imported photo source —
// not data-payload strings (google_photo_url rides in the RSC JSON even on
// typographic pages, so a bare string match would false-positive).
const importedImgs = (html) =>
  (html.match(/<img\b[^>]*\bsrc="[^"]*(place-photo|googleusercontent|wikimedia|ggpht)[^"]*"/gi) || []).length;

const run = async () => {
  console.log(`\nProduction audit → ${BASE}\n`);

  // 0. DEPLOYED COMMIT — the headline. What is prod actually running?
  try {
    const sw = await get("/sw.js");
    const m = sw.html.match(/CACHE_VERSION\s*=\s*["']fr-([a-f0-9]{6,40})/i);
    if (m) {
      console.log(`Deployed commit (from /sw.js): ${m[1]}`);
      if (EXPECTED_SHA) {
        m[1].startsWith(EXPECTED_SHA) || EXPECTED_SHA.startsWith(m[1])
          ? ok(`prod matches expected ${EXPECTED_SHA}`)
          : bad(`prod is ${m[1]}, expected ${EXPECTED_SHA} — STALE DEPLOY`);
      }
    } else {
      console.log("  (could not read CACHE_VERSION from /sw.js — SW may differ)");
    }
  } catch (e) { bad(`/sw.js fetch failed: ${e.message}`); }

  // 1. Nav label — should be "Guide", never a "Radius" tab (#446).
  try {
    const { html } = await get("/today");
    /<[^>]*>\s*Guide\s*</.test(html) ? ok("nav shows 'Guide'") : bad("nav 'Guide' label not found");
    (html.match(/>\s*Radius\s*</g) || []).length === 0
      ? ok("no 'Radius' nav-tab label")
      : bad("'Radius' still rendered as a tab label (stale)");
  } catch (e) { bad(`/today fetch failed: ${e.message}`); }

  // 2. Events laning (#443) — no private/cancelled in the public HTML.
  try {
    const { html } = await get("/events");
    for (const term of ["Wedding", "Private Corp", "CANCELLED"]) {
      const n = (html.match(new RegExp(term, "g")) || []).length;
      n === 0 ? ok(`/events has no "${term}"`) : bad(`/events still shows "${term}" (${n}×) — eligibility stale`);
    }
  } catch (e) { bad(`/events fetch failed: ${e.message}`); }

  // 3. Map false precision (#444) — no "N ft" distance strings on /map.
  try {
    const { html } = await get("/map");
    const ft = (html.match(/\b\d{1,4}\s?ft\b/g) || []).length;
    ft === 0 ? ok("/map shows no 'ft' distances") : bad(`/map shows ${ft} 'ft' distance(s) — geo-confidence stale`);
  } catch (e) { bad(`/map fetch failed: ${e.message}`); }

  // 4. No imported photos in browse surfaces (Phase 1-3).
  for (const path of ["/category/coffee", "/category/family", "/m/frederick", "/m/brunswick", "/events", "/today"]) {
    try {
      const { html } = await get(path);
      const n = importedImgs(html);
      n === 0 ? ok(`${path} renders 0 imported <img>`) : bad(`${path} renders ${n} imported <img> (photo policy stale)`);
    } catch (e) { bad(`${path} fetch failed: ${e.message}`); }
  }

  console.log(`\n${failures === 0 ? "PASS — production matches the standard." : `FAIL — ${failures} check(s) failed (likely a stale/old production deploy).`}\n`);
  process.exit(failures === 0 ? 0 : 1);
};
run().catch((e) => { console.error(e); process.exit(2); });
