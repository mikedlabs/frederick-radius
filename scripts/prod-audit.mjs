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
const check = (pass, good, fail) => { if (pass) ok(good); else bad(fail); };

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { "User-Agent": "fr-prod-audit" } });
  return { status: res.status, html: await res.text() };
}
// Photo policy (revised): browse cards now LEAD with the curated Google
// place photo (placePhotoBlob / Google proxy), de-twinned via PHOTO_SUPPRESS
// with a category-mark fallback — the visual, decision-card direction the
// reference apps (Maps / DoorDash / Uber Eats) use. So curated Google
// sources are allowed. What stays banned is UNCONTROLLED imagery we never
// curated (Wikimedia / arbitrary hero_image), which had the provenance and
// wrong-photo problems (#437). Count only those.
const uncontrolledImgs = (html) =>
  (html.match(/<img\b[^>]*\bsrc="[^"]*(wikimedia|upload\.wikimedia)[^"]*"/gi) || []).length;

const run = async () => {
  console.log(`\nProduction audit → ${BASE}\n`);

  // 0. DEPLOYED COMMIT — the headline. What is prod actually running?
  try {
    const sw = await get("/sw.js");
    const m = sw.html.match(/CACHE_VERSION\s*=\s*["']fr-([a-f0-9]{6,40})/i);
    if (m) {
      console.log(`Deployed commit (from /sw.js): ${m[1]}`);
      if (EXPECTED_SHA) {
        check(
          m[1].startsWith(EXPECTED_SHA) || EXPECTED_SHA.startsWith(m[1]),
          `prod matches expected ${EXPECTED_SHA}`,
          `prod is ${m[1]}, expected ${EXPECTED_SHA} — STALE DEPLOY`,
        );
      }
    } else {
      console.log("  (could not read CACHE_VERSION from /sw.js)");
    }
  } catch (e) { bad(`/sw.js fetch failed: ${e.message}`); }

  // 1. Nav label — the front door is labelled "Ask" (UI facelift; route stays /guide).
  try {
    const { html } = await get("/today");
    check(/<[^>]*>\s*Ask\s*</.test(html), "nav shows 'Ask'", "nav 'Ask' label not found");
  } catch (e) { bad(`/today fetch failed: ${e.message}`); }

  // 2. Events laning (#443) — no private/cancelled anywhere in the HTML.
  try {
    const { html } = await get("/events");
    for (const term of ["Wedding", "Private Corp", "CANCELLED"]) {
      const n = (html.match(new RegExp(term, "g")) || []).length;
      check(n === 0, `/events has no "${term}"`, `/events still shows "${term}" (${n}×)`);
    }
  } catch (e) { bad(`/events fetch failed: ${e.message}`); }

  // 3. Map false precision (#444) — the bug is a distance attached to a
  // VAGUE location (a bare municipality name), e.g. "Frederick · 113 ft".
  // A distance on a real venue ("Weinberg Center · 343 ft") or amenity
  // ("nearest 376 ft") is EARNED and fine — so match only municipality-
  // name · distance, after stripping tags/RSC comment markers.
  try {
    const { html } = await get("/map");
    const text = html.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const MUNI = "Frederick|Brunswick|Thurmont|Middletown|Walkersville|Urbana|Emmitsburg|Mount Airy|New Market|Myersville|Woodsboro|Burkittsville|Rosemont";
    const vague = (text.match(new RegExp(`\\b(?:${MUNI})\\s*·\\s*\\d{1,4}\\s?ft\\b`, "g")) || []).length;
    check(vague === 0, "/map has no vague 'municipality · N ft' claims", `/map shows ${vague} vague-location distance claim(s)`);
  } catch (e) { bad(`/map fetch failed: ${e.message}`); }

  // 4. No UNCONTROLLED photos in browse surfaces. Curated Google place
  //    photos now lead the cards (the visual direction); only uncontrolled
  //    Wikimedia/arbitrary imagery stays banned.
  for (const path of ["/category/coffee", "/category/family", "/m/frederick", "/m/brunswick", "/events", "/today"]) {
    try {
      const { html } = await get(path);
      const n = uncontrolledImgs(html);
      check(n === 0, `${path} renders 0 uncontrolled <img>`, `${path} renders ${n} uncontrolled <img>`);
    } catch (e) { bad(`${path} fetch failed: ${e.message}`); }
  }

  console.log(`\n${failures === 0 ? "PASS — production matches the standard." : `FAIL — ${failures} check(s) failed.`}\n`);
  process.exit(failures === 0 ? 0 : 1);
};
run().catch((e) => { console.error(e); process.exit(2); });
