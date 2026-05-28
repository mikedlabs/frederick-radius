/**
 * Follow-up text searches for the 5 ambiguous records from the
 * initial audit pass (Stern Group, New Horizon Title, Creekside
 * House, Ben & Jerry's, Rick Ridgely). Unbiased search to confirm
 * whether the bias-circle pulled an unrelated business.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveAndEnrich, googlePlacesConfigured } from "@/lib/integrations/google-places";

function loadEnvLocal() {
  try {
    const text = readFileSync(resolve(".env.local"), "utf8");
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch {}
}
loadEnvLocal();

const QUERIES = [
  { slug: "the-stern-group", name: "The Stern Group Frederick MD" },
  { slug: "the-stern-group", name: "Stern Group financial advisor Frederick MD" },
  { slug: "new-horizon-title", name: "New Horizon Title Frederick MD" },
  { slug: "creekside-house", name: "Creekside House vacation rental Frederick MD" },
  { slug: "creekside-house", name: "Creekside House 24 S Court Street Frederick MD" },
  { slug: "ben-jerrys-14", name: "Ben & Jerry's Frederick MD" },
  { slug: "ben-jerrys-14", name: "Ben Jerry's ice cream 30 N Market St Frederick" },
  { slug: "rick-ridgely-allstate-insurance", name: "Rick Ridgely Allstate Frederick MD" },
  { slug: "rick-ridgely-allstate-insurance", name: "Rick Ridgely Insurance Frederick Maryland" },
];

async function main() {
  if (!googlePlacesConfigured()) {
    console.error("GOOGLE_PLACES_API_KEY missing.");
    process.exit(1);
  }
  const out: Array<Record<string, unknown>> = [];
  for (const q of QUERIES) {
    const enr = await resolveAndEnrich({ name: q.name });
    console.log(
      `${q.slug.padEnd(40)} "${q.name}" → ${enr?.display_name ?? "(no result)"} | ${enr?.formatted_address ?? ""} | status=${enr?.business_status ?? "?"}`,
    );
    out.push({
      slug: q.slug,
      query: q.name,
      display_name: enr?.display_name,
      formatted_address: enr?.formatted_address,
      business_status: enr?.business_status,
      website: enr?.website,
      lat: enr?.lat,
      lng: enr?.lng,
      primary_type: enr?.primary_type,
      google_place_id: enr?.google_place_id,
    });
  }
  writeFileSync(
    resolve("audit/dfp-mash-followup.json"),
    JSON.stringify(out, null, 2),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
