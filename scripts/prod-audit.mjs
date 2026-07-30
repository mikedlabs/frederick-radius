/**
 * Production acceptance canary — tests the apex URL after promotion.
 *
 * A green Vercel build is not proof that the public alias moved or that the
 * installed-app contract still points at the current product. This script
 * checks the real front door, primary routes, manifest, stable deep links,
 * one current event deep link, and the deploy SHA embedded in /sw.js.
 *
 * Manual:
 *   BASE_URL=https://frederickradius.app \
 *   EXPECTED_SHA=$(git rev-parse HEAD) \
 *   REQUIRE_EXPECTED_SHA=1 \
 *   node scripts/prod-audit.mjs
 *
 * EXPECTED_SHA is optional for an exploratory local run. The post-deploy
 * workflow sets REQUIRE_EXPECTED_SHA=1, making an alias that still serves an
 * older commit a hard failure.
 */
const BASE = new URL(
  (process.env.BASE_URL || "https://frederickradius.app").replace(/\/?$/, "/"),
);
const EXPECTED_SHA = process.env.EXPECTED_SHA?.trim().toLowerCase() || null;
const REQUIRE_EXPECTED_SHA = process.env.REQUIRE_EXPECTED_SHA === "1";
const REQUEST_TIMEOUT_MS = Number(process.env.CANARY_TIMEOUT_MS) || 20_000;
const USER_AGENT = "frederick-radius-production-canary/2";
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const CORE_ROUTES = ["/today", "/events", "/map"];
const STABLE_PLACE_PATH = "/places/brewers-alley-frederick";

let failures = 0;
const checkedPages = new Map();

const ok = (message) => console.log(`  ✓ ${message}`);
const note = (message) => console.log(`  · ${message}`);
const bad = (message) => {
  failures += 1;
  console.log(`  ✗ ${message}`);
};
const check = (pass, good, fail) => {
  if (pass) ok(good);
  else bad(fail);
};

function pathOf(value) {
  const url = new URL(value, BASE);
  return `${url.pathname}${url.search}`;
}

function isBetaDestination(value) {
  try {
    return new URL(value, BASE).pathname.startsWith("/beta");
  } catch {
    return true;
  }
}

async function request(path, { follow = true, accept = "*/*" } = {}) {
  const hops = [];
  let url = new URL(path, BASE);

  for (let index = 0; index < 6; index += 1) {
    const response = await fetch(url, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Accept: accept,
        "Cache-Control": "no-cache",
        "User-Agent": USER_AGENT,
      },
    });
    const location = response.headers.get("location");
    hops.push({ status: response.status, url: url.href, location });

    if (!follow || !REDIRECT_STATUSES.has(response.status) || !location) {
      return {
        status: response.status,
        url: url.href,
        headers: response.headers,
        body: await response.text(),
        hops,
      };
    }

    const next = new URL(location, url);
    if (next.origin !== BASE.origin) {
      return {
        status: response.status,
        url: url.href,
        headers: response.headers,
        body: "",
        hops,
        externalRedirect: next.href,
      };
    }
    url = next;
  }

  throw new Error(`${path} exceeded five redirects`);
}

function assertNoBetaRedirect(label, result) {
  const badHop = result.hops.find(
    (hop) =>
      isBetaDestination(hop.url) ||
      (hop.location && isBetaDestination(hop.location)),
  );
  check(
    !badHop,
    `${label} never enters the beta wall`,
    `${label} redirected through beta (${badHop?.location || badHop?.url})`,
  );
}

function healthyHtml(path, result) {
  const contentType = result.headers.get("content-type") || "";
  const lower = result.body.toLowerCase();
  const expectedPath = new URL(path, BASE).pathname;
  const finalPath = new URL(result.url).pathname;
  const healthy =
    result.status === 200 &&
    contentType.includes("text/html") &&
    result.body.includes("Frederick Radius") &&
    result.body.length > 4_000 &&
    !lower.includes("internal server error") &&
    !lower.includes("application error");

  check(
    healthy,
    `${path} is a healthy branded 200`,
    `${path} is unhealthy (${result.status}, ${contentType || "no content type"}, ${result.body.length} bytes)`,
  );
  check(
    finalPath === expectedPath,
    `${path} stays on its public route`,
    `${path} ended at ${finalPath}`,
  );
  check(
    !result.externalRedirect,
    `${path} stays on the production origin`,
    `${path} redirected off the apex to ${result.externalRedirect}`,
  );
  assertNoBetaRedirect(path, result);
}

function manifestHref(html) {
  const tags = html.match(/<link\b[^>]*>/gi) || [];
  for (const tag of tags) {
    if (!/\brel=(?:"[^"]*\bmanifest\b[^"]*"|'[^']*\bmanifest\b[^']*')/i.test(tag)) {
      continue;
    }
    const match = tag.match(/\bhref=(?:"([^"]+)"|'([^']+)')/i);
    if (match) return match[1] || match[2];
  }
  return "/manifest.webmanifest";
}

function currentEventPath(html) {
  const decoded = html
    .replace(/&quot;/g, '"')
    .replace(/\\u002f/gi, "/")
    .replace(/\\\//g, "/");
  const matches = decoded.matchAll(/\/events\/([a-z0-9][a-z0-9-]{2,})/gi);
  for (const match of matches) {
    const slug = match[1].toLowerCase();
    if (slug !== "browse" && slug !== "calendar") return `/events/${slug}`;
  }
  return null;
}

// Photo policy: curated, attributed place media is allowed. Raw Wikimedia
// sources on decision cards are not; those bypass the app's media review.
const uncontrolledImgs = (html) =>
  (
    html.match(
      /<img\b[^>]*\bsrc="[^"]*(?:wikimedia|upload\.wikimedia)[^"]*"/gi,
    ) || []
  ).length;

async function run() {
  console.log(`\nProduction canary → ${BASE.origin}\n`);

  // The root must resolve directly to Today. A beta detour, marketing cover,
  // or generic 200 at / is a front-door regression even if /today itself works.
  try {
    const root = await request("/", { follow: false, accept: "text/html" });
    const location = root.headers.get("location");
    const destination = location ? new URL(location, BASE) : null;
    check(
      REDIRECT_STATUSES.has(root.status) &&
        destination?.origin === BASE.origin &&
        destination.pathname === "/today",
      "/ redirects directly to /today",
      `/ should redirect to /today (got ${root.status}${location ? ` → ${location}` : ""})`,
    );
    assertNoBetaRedirect("/", root);
  } catch (error) {
    bad(`/ front-door check failed: ${error.message}`);
  }

  for (const path of CORE_ROUTES) {
    try {
      const result = await request(path, { accept: "text/html" });
      checkedPages.set(path, result);
      healthyHtml(path, result);
    } catch (error) {
      bad(`${path} fetch failed: ${error.message}`);
    }
  }

  // Installed-app contract: discover the linked manifest, verify its launch
  // target, then prove that target is the same healthy public Today route.
  try {
    const today = checkedPages.get("/today");
    const href = manifestHref(today?.body || "");
    const manifest = await request(href, {
      accept: "application/manifest+json, application/json",
    });
    assertNoBetaRedirect("manifest", manifest);
    check(
      manifest.status === 200,
      `${pathOf(href)} is available`,
      `${pathOf(href)} returned ${manifest.status}`,
    );
    let parsed = null;
    try {
      parsed = JSON.parse(manifest.body);
    } catch {
      bad(`${pathOf(href)} is not valid JSON`);
    }
    check(
      parsed?.start_url === "/today",
      "manifest start_url is /today",
      `manifest start_url is ${JSON.stringify(parsed?.start_url)}`,
    );
  } catch (error) {
    bad(`manifest contract failed: ${error.message}`);
  }

  // A stable place catches dynamic-route/build regressions. A current event is
  // discovered from the actual board so the canary never pins an expired slug.
  for (const path of [STABLE_PLACE_PATH]) {
    try {
      const result = await request(path, { accept: "text/html" });
      healthyHtml(path, result);
    } catch (error) {
      bad(`${path} deep-link fetch failed: ${error.message}`);
    }
  }

  try {
    const events = checkedPages.get("/events");
    const path = currentEventPath(events?.body || "");
    check(
      Boolean(path),
      `found a current event deep link (${path})`,
      "/events did not expose a representative event deep link",
    );
    if (path) {
      const result = await request(path, { accept: "text/html" });
      healthyHtml(path, result);
    }
  } catch (error) {
    bad(`event deep-link check failed: ${error.message}`);
  }

  // /sw.js is intentionally versioned by VERCEL_GIT_COMMIT_SHA. Cache-bust
  // the read so this checks the apex alias now, not a previously cached worker.
  try {
    const sw = await request(`/sw.js?canary=${Date.now()}`, {
      accept: "text/javascript, application/javascript",
    });
    assertNoBetaRedirect("/sw.js", sw);
    const match = sw.body.match(
      /CACHE_VERSION\s*=\s*["']fr-([a-f0-9]{6,40})/i,
    );
    const deployed = match?.[1]?.toLowerCase() || null;
    check(
      sw.status === 200 && Boolean(deployed),
      `deployed commit is ${deployed}`,
      `/sw.js did not expose a deployed commit (${sw.status})`,
    );
    if (!EXPECTED_SHA) {
      if (REQUIRE_EXPECTED_SHA) {
        bad("EXPECTED_SHA is required for the post-deploy alias gate");
      } else {
        note("EXPECTED_SHA not supplied; deploy identity was observed but not compared");
      }
    } else if (deployed) {
      check(
        deployed.startsWith(EXPECTED_SHA) ||
          EXPECTED_SHA.startsWith(deployed),
        `apex serves expected commit ${EXPECTED_SHA.slice(0, 12)}`,
        `ALIAS MISMATCH: apex serves ${deployed}, expected ${EXPECTED_SHA.slice(0, 12)}`,
      );
    }
  } catch (error) {
    bad(`/sw.js deploy-identity check failed: ${error.message}`);
  }

  // Preserve the focused trust checks from the original audit.
  const eventsHtml = checkedPages.get("/events")?.body || "";
  for (const term of ["Private Corp", "CANCELLED"]) {
    const count = (
      eventsHtml.match(new RegExp(term.replace(/ /g, "\\s+"), "gi")) || []
    ).length;
    check(
      count === 0,
      `/events has no "${term}" listing`,
      `/events still shows "${term}" (${count}×)`,
    );
  }

  const mapHtml = checkedPages.get("/map")?.body || "";
  const mapText = mapHtml
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
  const municipality =
    "Frederick|Brunswick|Thurmont|Middletown|Walkersville|Urbana|Emmitsburg|Mount Airy|New Market|Myersville|Woodsboro|Burkittsville|Rosemont";
  const vague = (
    mapText.match(
      new RegExp(`\\b(?:${municipality})\\s*·\\s*\\d{1,4}\\s?ft\\b`, "g"),
    ) || []
  ).length;
  check(
    vague === 0,
    "/map has no vague municipality-distance claims",
    `/map shows ${vague} vague municipality-distance claim(s)`,
  );

  for (const [path, result] of checkedPages) {
    const count = uncontrolledImgs(result.body);
    check(
      count === 0,
      `${path} renders no uncontrolled images`,
      `${path} renders ${count} uncontrolled image(s)`,
    );
  }

  console.log(
    `\n${
      failures === 0
        ? "PASS — apex, routes, install contract, deep links, and deploy identity agree."
        : `FAIL — ${failures} production canary check(s) failed.`
    }\n`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 2;
});
