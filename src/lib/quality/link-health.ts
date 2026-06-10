/**
 * Link health (data brief, Phase 1, section 4.4: source URL validation).
 *
 * A "source" or "website" link that 404s quietly breaks the product's
 * whole premise, which is the most trusted answer. This checks a batch
 * of URLs and reports the dead ones. It is the validation half of the
 * normalizer's source-URL stage; the weekly cron in
 * app/api/cron/link-health drives it over a rotating slice of the
 * catalog so the full set is covered without a single heavy run.
 *
 * Network-touching but defensive: every check is timeout-capped and
 * fail-soft, a network error is reported as "unreachable" rather than
 * thrown, and the caller bounds concurrency. Pure helpers (slicing,
 * verdict) are split out so they unit test without the network.
 */

export type LinkVerdict = {
  url: string;
  ok: boolean;
  status: number | null;
  reason: "ok" | "dead" | "unreachable" | "skipped";
};

/** A status is healthy if it is not a hard 4xx or 5xx. Many sites refuse
 *  HEAD with 405 or answer 403 to bots while serving humans fine, so
 *  those are treated as reachable, not dead: the goal is catching gone
 *  pages, not policing bot policy. */
export function verdictForStatus(url: string, status: number): LinkVerdict {
  const dead = status === 404 || status === 410 || status === 451 || status >= 500;
  return { url, ok: !dead, status, reason: dead ? "dead" : "ok" };
}

/** Rotating daily slice so a weekly cycle covers the whole list with a
 *  bounded per-run cost. Deterministic by URL hash, so a given URL lands
 *  on the same cycle day each week. */
export function sliceForCycle(urls: string[], cycleDays: number, today: number): string[] {
  return urls.filter((u) => hash(u) % cycleDays === today);
}

function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

async function checkOne(url: string, timeoutMs: number): Promise<LinkVerdict> {
  if (!/^https?:\/\//i.test(url)) return { url, ok: true, status: null, reason: "skipped" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // HEAD first; some servers reject it, so a 405 falls back to a ranged
    // GET that pulls a single byte rather than the whole page.
    let res = await fetch(url, { method: "HEAD", redirect: "follow", signal: ctrl.signal });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: ctrl.signal,
        headers: { Range: "bytes=0-0" },
      });
    }
    return verdictForStatus(url, res.status);
  } catch {
    return { url, ok: false, status: null, reason: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

/** Check a batch with bounded concurrency. Returns only the failures,
 *  since a healthy link is the unremarkable case. */
export async function checkLinks(
  urls: string[],
  opts: { concurrency?: number; timeoutMs?: number } = {},
): Promise<LinkVerdict[]> {
  const concurrency = opts.concurrency ?? 8;
  const timeoutMs = opts.timeoutMs ?? 8000;
  const queue = [...new Set(urls)];
  const failures: LinkVerdict[] = [];

  async function worker() {
    for (;;) {
      const url = queue.shift();
      if (!url) return;
      const v = await checkOne(url, timeoutMs);
      if (!v.ok) failures.push(v);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return failures;
}
