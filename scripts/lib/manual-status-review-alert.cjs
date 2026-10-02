// Read-only companion to the existing production-health issue. Never renews
// evidence or changes operational eligibility. No provider calls or secrets.
const OVERRIDE_PATH = 'src/data/place-status-overrides.json';
const MAX_BYTES = 65_536;
const MAX_ENTRIES = 200;
const LIST_LIMIT = 20;
const DAY = 86_400_000;

function unknown(reason = 'The deployed manual status review file could not be checked.') {
  return { status: 'unknown', reason, due: 0, overdue: 0, invalid: 0, rows: [] };
}

function calendarDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
    ? time / DAY : null;
}

function easternDay(now) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function evidenceURL(value) {
  if (typeof value !== 'string' || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function assessManualStatusReviews(raw, now = new Date()) {
  const today = easternDay(now);
  if (!today || !raw || typeof raw !== 'object' || Array.isArray(raw)) return unknown('Invalid review metadata or clock.');
  const entries = Object.entries(raw);
  if (!entries.length || entries.length > MAX_ENTRIES) return unknown('The review file is empty or exceeds its bounded entry limit.');
  const rows = [];
  let invalid = 0;
  for (const [slug, entry] of entries) {
    const reviewDay = calendarDay(entry?.review_after);
    const effectiveDay = calendarDay(entry?.effective_at);
    const source = evidenceURL(entry?.source);
    if (!/^[a-z0-9][a-z0-9-]{0,159}$/.test(slug) || !entry ||
        !['operational', 'closed_temporarily', 'closed_permanently'].includes(entry.status) ||
        reviewDay === null || effectiveDay === null || effectiveDay > reviewDay || !source ||
        typeof entry.note !== 'string' || !entry.note.trim()) {
      invalid++;
      continue;
    }
    // The runtime permits scheduled evidence but does not activate it early.
    if (effectiveDay > calendarDay(today)) continue;
    const daysRemaining = reviewDay - calendarDay(today);
    if (daysRemaining > 7) continue;
    rows.push({ slug, deadline: entry.review_after, source, daysRemaining,
      review: daysRemaining < 0 ? 'overdue' : 'due',
      consequence: entry.status === 'operational'
        ? daysRemaining < 0 ? 'Operational correction expired; provider status applies.' : 'Operational correction expires after this Eastern date.'
        : 'Closure remains active; review does not automatically reopen it.',
    });
  }
  rows.sort((a, b) => a.daysRemaining - b.daysRemaining || a.slug.localeCompare(b.slug));
  const due = rows.filter(row => row.review === 'due').length;
  const overdue = rows.length - due;
  return { status: invalid ? 'unknown' : rows.length ? 'attention' : 'clear', today,
    due, overdue, invalid, rows,
    ...(invalid ? { reason: `${invalid} invalid review record(s); review coverage is incomplete.` } : {}),
  };
}

// Production health currently exposes a 12-character revision. Resolve it to
// an immutable full SHA before the single, bounded Contents API read.
async function readDeployedStatusReviews({ github, owner, repo, revision, now = new Date() }) {
  if (typeof revision !== 'string' || !/^[a-f0-9]{12,40}$/.test(revision)) return unknown('Production did not provide a usable commit revision.');
  try {
    const commit = await github.rest.repos.getCommit({ owner, repo, ref: revision,
      headers: { accept: 'application/vnd.github.sha' }, request: { timeout: 10_000 } });
    const sha = typeof commit.data === 'string' ? commit.data.trim() : '';
    if (!/^[a-f0-9]{40}$/.test(sha) || !sha.startsWith(revision)) return unknown('Production revision could not be resolved to the expected immutable commit.');
    const response = await github.rest.repos.getContent({ owner, repo, path: OVERRIDE_PATH,
      ref: sha, request: { timeout: 10_000 } });
    const file = response.data;
    if (!file || Array.isArray(file) || file.type !== 'file' || file.path !== OVERRIDE_PATH ||
        file.encoding !== 'base64' || !Number.isInteger(file.size) || file.size <= 0 || file.size > MAX_BYTES ||
        typeof file.content !== 'string' || file.content.length > MAX_BYTES * 1.5) return unknown('The deployed review file is missing, unsupported, or oversized.');
    const decoded = Buffer.from(file.content, 'base64');
    if (decoded.length !== file.size || decoded.length > MAX_BYTES) return unknown('The deployed review file did not match its declared size.');
    return { ...assessManualStatusReviews(JSON.parse(decoded.toString('utf8')), now), revision: sha };
  } catch {
    // No raw API error, token, or response is included in the issue.
    return unknown();
  }
}

function renderManualStatusReviews(report) {
  const counts = `${report.overdue} overdue; ${report.due} due within 7 days; ${report.invalid} invalid`;
  const summary = `Manual place status reviews: ${report.status} · ${counts}`;
  const lines = ['**Manual place status reviews**', '', summary];
  if (report.reason) lines.push('', report.reason);
  if (report.today) lines.push('', `Dates use America/New_York; checked ${report.today}. The deadline remains inclusive.`);
  if (report.rows.length) {
    lines.push('', '| Place identity | Review deadline | State | Evidence source | Consequence |', '| --- | --- | --- | --- | --- |');
    for (const row of report.rows.slice(0, LIST_LIMIT)) {
      const url = row.source.replaceAll('<', '%3C').replaceAll('>', '%3E');
      lines.push(`| \`${row.slug}\` | ${row.deadline} | ${row.review} | [Source](<${url}>) | ${row.consequence} |`);
    }
    if (report.rows.length > LIST_LIMIT) lines.push('', `${report.rows.length - LIST_LIMIT} additional reviews omitted; totals above include them.`);
    lines.push('', 'Recheck the linked evidence and prepare a reviewed data correction. This notice does not renew evidence, publish hours, or change place status.');
  }
  return { summary, detail: lines.join('\n') };
}

module.exports = { assessManualStatusReviews, readDeployedStatusReviews, renderManualStatusReviews, unknown };
