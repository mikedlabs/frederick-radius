import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import review from './manual-status-review-alert.cjs';
const { assessManualStatusReviews: assess, readDeployedStatusReviews: read, renderManualStatusReviews: render } = review;
const NOW = new Date('2026-10-02T16:00:00Z');
const SHA = 'aebbe216fd37b40a645024334599d09d0bb98832';
const entry = (review_after, status = 'operational') => ({ status, effective_at: '2026-08-10', review_after,
  source: 'https://example.org/official', note: 'Source-backed review fixture.' });

test('deadline is inclusive and the seven-day warning boundary uses calendar days', () => {
  const result = assess({ yesterday: entry('2026-10-01'), today: entry('2026-10-02'), next: entry('2026-10-09'), later: entry('2026-10-10') }, NOW);
  assert.equal(result.status, 'attention');
  assert.equal(result.overdue, 1);
  assert.equal(result.due, 2);
  assert.deepEqual(result.rows.map(row => [row.slug, row.daysRemaining]), [['yesterday', -1], ['today', 0], ['next', 7]]);
});

test('UTC midnight does not expire an Eastern-calendar correction early', () => {
  const rows = { cafe: entry('2026-10-01') };
  assert.equal(assess(rows, new Date('2026-10-02T03:59:59Z')).rows[0].review, 'due');
  assert.equal(assess(rows, new Date('2026-10-02T04:00:00Z')).rows[0].review, 'overdue');
});

test('DST transition does not turn seven calendar days into six or eight', () => {
  assert.equal(assess({ cafe: { ...entry('2026-03-14'), effective_at: '2026-01-01' } }, new Date('2026-03-07T17:00:00Z')).rows[0].daysRemaining, 7);
});

test('expired correction and overdue closure have different consequences', () => {
  const result = assess({ cafe: entry('2026-10-01'), childcare: entry('2026-10-01', 'closed_temporarily') }, NOW);
  assert.match(result.rows.find(row => row.slug === 'cafe').consequence, /expired; provider status/);
  assert.match(result.rows.find(row => row.slug === 'childcare').consequence, /Closure remains active/);
});

test('invalid dates, unsafe sources and malformed input never clear', () => {
  for (const raw of [null, [], {}, { cafe: entry('2026-02-30') }, { cafe: { ...entry('2026-10-01'), effective_at: '2026-10-03' } },
    { cafe: { ...entry('2026-11-01'), source: 'http://example.org' } }, { cafe: { ...entry('2026-11-01'), source: 'https://user:secret@example.org' } },
    { '@owner': entry('2026-10-01') }]) assert.equal(assess(raw, NOW).status, 'unknown');
});

test('valid clear metadata can recover; invalid rows retain valid attention rows', () => {
  assert.equal(assess({ cafe: entry('2026-11-01') }, NOW).status, 'clear');
  const result = assess({ cafe: entry('2026-10-01'), broken: {} }, NOW);
  assert.equal(result.status, 'unknown');
  assert.equal(result.overdue, 1);
  assert.equal(result.rows.length, 1);
});

test('rendering names stable identities, bounds detail and retains total counts', () => {
  const raw = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`place-${i}`, entry('2026-10-01')]));
  const text = render(assess(raw, NOW));
  assert.match(text.summary, /25 overdue/);
  assert.match(text.detail, /5 additional reviews omitted/);
  assert.equal((text.detail.match(/\| `place-/g) || []).length, 20);
  assert.match(text.detail, /https:\/\/example.org\/official/);
});

function api(raw, overrides = {}) {
  const text = JSON.stringify(raw);
  const calls = [];
  return { calls, rest: { repos: {
    getCommit: async args => { calls.push(['commit', args]); return { data: SHA }; },
    getContent: async args => { calls.push(['contents', args]); return { data: { type: 'file', path: 'src/data/place-status-overrides.json',
      encoding: 'base64', size: Buffer.byteLength(text), content: Buffer.from(text).toString('base64'), ...overrides } }; },
  } } };
}
const context = github => ({ github, owner: 'owner', repo: 'radius', revision: SHA.slice(0, 12), now: NOW });

test('short production revision resolves to immutable SHA before one bounded file read', async () => {
  const github = api({ cafe: entry('2026-11-01') });
  const report = await read(context(github));
  assert.equal(report.status, 'clear');
  assert.equal(report.revision, SHA);
  assert.equal(github.calls.length, 2);
  assert.equal(github.calls[0][1].headers.accept, 'application/vnd.github.sha');
  assert.equal(github.calls[1][1].ref, SHA);
  assert.equal(github.calls[1][1].path, 'src/data/place-status-overrides.json');
});

test('missing revision, mismatched commit, API failure and unsupported content remain unknown', async () => {
  const github = api({ cafe: entry('2026-11-01') });
  assert.equal((await read({ ...context(github), revision: 'main' })).status, 'unknown');
  assert.equal(github.calls.length, 0);
  github.rest.repos.getCommit = async () => ({ data: 'b'.repeat(40) });
  assert.equal((await read(context(github))).status, 'unknown');
  github.rest.repos.getCommit = async () => { throw new Error('private response'); };
  const failed = await read(context(github));
  assert.equal(failed.status, 'unknown');
  assert.doesNotMatch(render(failed).detail, /private response/);
  for (const override of [{ size: 65_537 }, { type: 'symlink' }, { content: '%%%invalid' }, { encoding: 'none' }, { path: 'other.json' }]) {
    assert.equal((await read(context(api({ cafe: entry('2026-11-01') }, override)))).status, 'unknown');
  }
});

test('future-effective records stay valid and inactive until their Eastern effective date', () => {
  const raw = { cafe: { ...entry('2026-10-08'), effective_at: '2026-10-03' } };
  assert.equal(assess(raw, NOW).status, 'clear');
  const active = assess(raw, new Date('2026-10-03T16:00:00Z'));
  assert.equal(active.status, 'attention');
  assert.equal(active.rows[0].daysRemaining, 5);
});

test('actual issue-delivery shell covers create, comment, close and healthy no-op branches', () => {
  const workflow = fs.readFileSync(new URL('../../.github/workflows/production-health-alert.yml', import.meta.url), 'utf8');
  const step = workflow.split('      - name: Open, update, or close the tracking issue\n')[1];
  assert.ok(step);
  const script = step.split('        run: |\n')[1].split('\n').map(line => line.replace(/^          /, '')).join('\n');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'radius-status-review-'));
  try {
    const log = path.join(tmp, 'commands');
    fs.writeFileSync(path.join(tmp, 'gh'), '#!/bin/sh\nif [ "$1 $2" = "issue list" ]; then printf "%s\\n" "$EXISTING_ISSUE"; exit 0; fi\ncase "$1 $2" in\n  "issue comment"|"issue close"|"issue create") printf "%s\\n" "$2" >> "$CALL_LOG" ;;\n  *) exit 99 ;;\nesac\n', { mode: 0o755 });
    const states = [['operational', 'clear'], ['operational', 'attention'], ['operational', 'unknown'], ['degraded', 'clear'], ['', 'clear'], ['operational', '']];
    for (const existing of ['42', '']) for (const [status, manual] of states) {
      const healthy = status === 'operational' && manual === 'clear';
      const expected = healthy ? existing ? ['comment', 'close'] : [] : existing ? ['comment'] : ['create'];
      fs.writeFileSync(log, '');
      const result = spawnSync('/bin/bash', ['-e', '-c', script], { encoding: 'utf8', env: {
        PATH: `${tmp}:/usr/bin:/bin`, CALL_LOG: log, EXISTING_ISSUE: existing, STATUS: status, MANUAL_STATUS: manual,
        SUMMARY: 'App result', MANUAL_SUMMARY: 'Review result', DETAIL: 'App detail', MANUAL_DETAIL: 'Review detail',
        TITLE: '[health] Test', GH_REPO: 'owner/radius', RUN_URL: 'https://example.org/run',
      } });
      assert.equal(result.status, 0, result.stderr);
      const commands = fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean);
      assert.deepEqual(commands, expected, `${status}/${manual}; existing=${existing || 'none'}`);
      if (healthy && !existing) assert.match(result.stdout, /Healthy, and no open issue/);
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
