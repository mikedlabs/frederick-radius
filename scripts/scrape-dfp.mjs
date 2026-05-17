/**
 * One-shot scraper for Downtown Frederick Partnership business directory.
 *
 * Pulls all `/place/` URLs from DFP's sitemaps, fetches each with concurrency,
 * extracts the embedded Vibemap metadata fields (which include aggregated
 * data from Yelp + Google Places + Visit Frederick), and writes the result
 * to /tmp/dfp-businesses.jsonl for import.
 *
 * Run: node scripts/scrape-dfp.mjs
 *
 * Politeness: 8 concurrent requests, 100ms jitter, brief backoff on 429/5xx.
 */

import { appendFileSync, existsSync, unlinkSync } from "node:fs";

const UA = "FrederickRadius/1.0 (+https://frederickradius.app; civic discovery)";
const SITEMAPS = [
  "https://downtownfrederick.org/vibemap_place-sitemap.xml",
  "https://downtownfrederick.org/vibemap_place-sitemap2.xml",
];
const OUT = "/tmp/dfp-businesses.jsonl";
const CONCURRENCY = 8;
const REQUEST_DELAY_MS = 80;

/**
 * Extract a Vibemap-style JSON field value from raw HTML.
 * The pages embed fields like: "vibemap_place_address":"15 E Patrick St…"
 * inside React state JSON or page-data scripts.
 */
function extractField(html, field) {
  // Numeric: "field":-77.41
  const numMatch = html.match(new RegExp(`"${field}":(-?[0-9]+(?:\\.[0-9]+)?)`));
  if (numMatch) return parseFloat(numMatch[1]);
  // Boolean: "field":true|false
  const boolMatch = html.match(new RegExp(`"${field}":(true|false)`));
  if (boolMatch) return boolMatch[1] === "true";
  // String: "field":"value with escapes" — stop at unescaped quote.
  const strMatch = html.match(new RegExp(`"${field}":"((?:[^"\\\\]|\\\\.)*)"`));
  if (strMatch) {
    // Unescape JSON-style \/ and \" and \uXXXX
    return strMatch[1]
      .replace(/\\\//g, "/")
      .replace(/\\"/g, '"')
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\n/g, " ")
      .replace(/\\t/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return undefined;
}

function extractPhoneFromText(text) {
  if (!text) return undefined;
  // Match (301) 631-9300, 301-631-9300, 301.631.9300
  const m = text.match(/(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})/);
  return m ? m[1] : undefined;
}

function extractInstagramFromText(text) {
  if (!text) return undefined;
  const m = text.match(/instagram\.com\/([a-zA-Z0-9._]+)/);
  return m ? m[1] : undefined;
}

async function fetchSitemap(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const xml = await r.text();
  return [...xml.matchAll(/<loc>(https:\/\/downtownfrederick\.org\/place\/[^<]+\/)<\/loc>/g)]
    .map((m) => m[1])
    .filter((u) => {
      // Skip meta/category landing pages
      const slug = u.split("/place/")[1].replace(/\/$/, "");
      return slug && !["downtown-frederick", "frederick-2"].includes(slug);
    });
}

async function fetchBusiness(url, attempt = 1) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (r.status === 429 || r.status >= 500) {
      if (attempt < 3) {
        await new Promise((res) => setTimeout(res, 1500 * attempt));
        return fetchBusiness(url, attempt + 1);
      }
      return { url, error: `HTTP ${r.status}` };
    }
    if (!r.ok) return { url, error: `HTTP ${r.status}` };
    const html = await r.text();

    const slug = url.split("/place/")[1].replace(/\/$/, "");
    const id = extractField(html, "vibemap_place_id");
    const lng = extractField(html, "vibemap_place_longitude");
    const lat = extractField(html, "vibemap_place_latitude");
    const address = extractField(html, "vibemap_place_address");
    const text_full = extractField(html, "vibemap_place_text_full");
    const website = extractField(html, "vibemap_place_url");
    const short_desc = extractField(html, "vibemap_place_short_description");
    const tags = extractField(html, "vibemap_place_tags");
    const city = extractField(html, "vibemap_place_city");
    const subcategories = extractField(html, "vibemap_place_subcategories");
    const cat_level1 = extractField(html, "vibemap_place_categories_level1");
    const google_place_id = extractField(html, "vibemap_place_data_source_identifier");
    const rating = extractField(html, "vibemap_place_aggregate_rating");
    const rating_count = extractField(html, "vibemap_place_aggregate_rating_count");
    const price = extractField(html, "vibemap_place_price");
    const is_closed = extractField(html, "vibemap_place_is_closed");
    const is_duplicate = extractField(html, "vibemap_place_is_duplicate");
    const is_chain = extractField(html, "vibemap_place_is_chain");
    const is_featured = extractField(html, "vibemap_place_is_featured");
    const title_match = html.match(/<title>([^<•|]+?)\s*[•|]/);
    const name = title_match ? title_match[1].replace(/&amp;/g, "&").replace(/&#8226;/g, "·").trim() : slug;

    const phone = extractPhoneFromText(text_full);
    const instagram = extractInstagramFromText(text_full);

    return {
      url, slug, id, name,
      lat: typeof lat === "number" ? lat : undefined,
      lng: typeof lng === "number" ? lng : undefined,
      address,
      city,
      phone, website, instagram,
      short_description: short_desc || undefined,
      excerpt: typeof text_full === "string" ? text_full.slice(0, 500) : undefined,
      tags,
      subcategories,
      category_level1: cat_level1,
      google_place_id,
      rating, rating_count,
      price,
      is_closed, is_duplicate, is_chain, is_featured,
    };
  } catch (e) {
    return { url, error: e.message };
  }
}

async function main() {
  console.log("Fetching sitemaps…");
  const allUrls = new Set();
  for (const sm of SITEMAPS) {
    const urls = await fetchSitemap(sm);
    urls.forEach((u) => allUrls.add(u));
  }
  const list = [...allUrls];
  console.log(`Found ${list.length} business URLs`);

  if (existsSync(OUT)) unlinkSync(OUT);

  let done = 0;
  let queue = [...list];
  let active = 0;
  const startTime = Date.now();

  await new Promise((resolveAll) => {
    const next = () => {
      if (queue.length === 0 && active === 0) return resolveAll();
      while (active < CONCURRENCY && queue.length > 0) {
        const url = queue.shift();
        active++;
        setTimeout(async () => {
          const data = await fetchBusiness(url);
          appendFileSync(OUT, JSON.stringify(data) + "\n");
          done++;
          if (done % 25 === 0 || done === list.length) {
            const rate = done / ((Date.now() - startTime) / 1000);
            const remaining = Math.round((list.length - done) / Math.max(rate, 0.01));
            console.log(`  ${done}/${list.length} (${rate.toFixed(1)}/s, ~${remaining}s left)`);
          }
          active--;
          next();
        }, Math.random() * REQUEST_DELAY_MS);
      }
    };
    next();
  });

  console.log(`\nWrote ${OUT}`);
  console.log(`Took ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
}

main().catch((e) => { console.error(e); process.exit(1); });
