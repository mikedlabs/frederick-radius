import "server-only";
import { unstable_cache } from "next/cache";

/**
 * Untappd for Business (UTFB) — the sanctioned live-menu path.
 *
 * The old public Untappd API is closed to new applicants; the door that
 * is open is per-VENUE: a brewery on UTFB Premium can mint a read-only
 * API token from their own dashboard and hand it to us. There is no
 * app-level key at all — each pilot brewery contributes its own token,
 * and a brewery without one simply doesn't get the live-taps feature.
 * docs: https://docs.business.untappd.com (Basic auth, /api/v1).
 *
 * House rules baked in:
 *  - TEXT ONLY. Untappd-hosted artwork is never hotlinked or copied —
 *    names, styles, ABV/IBU, and descriptions carry the value.
 *  - Tokens are secrets. They live in ONE server env var
 *    (UNTAPPD_BUSINESS_ACCOUNTS, a JSON array) and never reach the
 *    client; this module is server-only.
 *  - Fail-soft everywhere: a brewery whose token breaks drops out of
 *    the section silently rather than breaking /beer.
 */
const BASE = "https://business.untappd.com/api/v1";
const TIMEOUT_MS = 8_000;

export type UntappdAccount = {
  /** The brewery's Radius place slug — joins the token to our catalog. */
  slug: string;
  /** UTFB login email (Basic auth pairs it with the token). */
  email: string;
  /** READ-ONLY UTFB API token. Never a read & write token. */
  token: string;
  /** Optional: pin a UTFB location id; otherwise the first location is used. */
  locationId?: number;
};

export type TapItem = {
  name: string;
  style?: string;
  abv?: number;
  ibu?: number;
  description?: string;
};

export type TapSection = { name: string; items: TapItem[] };

export type TapMenu = {
  slug: string;
  menuName: string;
  sections: TapSection[];
  fetchedAt: string;
};

/** Parse the env registry. Exported for tests; tolerant of bad JSON. */
export function parseUntappdAccounts(raw: string | undefined): UntappdAccount[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is UntappdAccount =>
        Boolean(a) &&
        typeof a.slug === "string" &&
        typeof a.email === "string" &&
        typeof a.token === "string" &&
        a.slug.length > 0 &&
        a.token.length > 0,
    );
  } catch {
    return [];
  }
}

/** Shape raw UTFB item rows to our text-only tap items. Exported for tests. */
export function shapeTapItems(rows: unknown[]): TapItem[] {
  const out: TapItem[] = [];
  for (const raw of rows) {
    const it = raw as {
      name?: unknown;
      style?: unknown;
      abv?: unknown;
      ibu?: unknown;
      description?: unknown;
    };
    if (typeof it.name !== "string" || !it.name.trim()) continue; // never invent
    const item: TapItem = { name: it.name.trim() };
    if (typeof it.style === "string" && it.style.trim()) item.style = it.style.trim();
    const abv = typeof it.abv === "number" ? it.abv : typeof it.abv === "string" ? parseFloat(it.abv) : NaN;
    if (Number.isFinite(abv) && abv > 0) item.abv = abv;
    const ibu = typeof it.ibu === "number" ? it.ibu : typeof it.ibu === "string" ? parseFloat(it.ibu) : NaN;
    if (Number.isFinite(ibu) && ibu > 0) item.ibu = ibu;
    if (typeof it.description === "string" && it.description.trim()) {
      item.description = it.description.trim().slice(0, 240);
    }
    out.push(item);
  }
  return out;
}

async function utfbGet(path: string, account: UntappdAccount): Promise<unknown> {
  const auth = Buffer.from(`${account.email}:${account.token}`).toString("base64");
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Basic ${auth}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`utfb ${path} -> ${res.status}`);
  return res.json();
}

function rowsOf(payload: unknown, key: string): unknown[] {
  const obj = payload as Record<string, unknown> | null;
  const rows = obj?.[key];
  return Array.isArray(rows) ? rows : [];
}

async function fetchMenuForAccount(account: UntappdAccount): Promise<TapMenu | null> {
  let locationId = account.locationId;
  if (!locationId) {
    const locations = rowsOf(await utfbGet("/locations", account), "locations");
    const first = locations[0] as { id?: number } | undefined;
    if (!first?.id) return null;
    locationId = first.id;
  }
  const menus = rowsOf(await utfbGet(`/locations/${locationId}/menus`, account), "menus") as Array<{
    id?: number;
    name?: string;
  }>;
  if (menus.length === 0) return null;
  // Prefer the menu that reads like the tap list; otherwise the first.
  const menu = menus.find((m) => /tap|draft|draught|on tap|pour/i.test(m.name ?? "")) ?? menus[0];
  if (!menu.id) return null;
  const sectionsRaw = rowsOf(await utfbGet(`/menus/${menu.id}/sections`, account), "sections") as Array<{
    id?: number;
    name?: string;
  }>;
  const sections: TapSection[] = [];
  for (const section of sectionsRaw.slice(0, 6)) {
    if (!section.id) continue;
    const items = shapeTapItems(rowsOf(await utfbGet(`/sections/${section.id}/items`, account), "items"));
    if (items.length > 0) sections.push({ name: section.name?.trim() || "On tap", items: items.slice(0, 24) });
  }
  if (sections.length === 0) return null;
  return {
    slug: account.slug,
    menuName: menu.name?.trim() || "On tap",
    sections,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Live tap menus for every configured pilot brewery. Cached 15 minutes —
 * live enough to trust, gentle on the venues' API quota. Returns [] when
 * no accounts are configured (today's default), so the UI self-hides.
 */
export const liveTapMenus = unstable_cache(
  async (): Promise<TapMenu[]> => {
    const accounts = parseUntappdAccounts(process.env.UNTAPPD_BUSINESS_ACCOUNTS);
    if (accounts.length === 0) return [];
    const results = await Promise.all(
      accounts.map((account) =>
        fetchMenuForAccount(account).catch((err) => {
          console.error(`[untappd] ${account.slug}:`, err instanceof Error ? err.message : err);
          return null;
        }),
      ),
    );
    return results.filter((menu): menu is TapMenu => menu !== null);
  },
  ["untappd-live-taps-v1"],
  { revalidate: 900, tags: ["untappd"] },
);
