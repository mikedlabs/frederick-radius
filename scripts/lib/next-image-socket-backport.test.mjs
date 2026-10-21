import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Socket } from 'node:net';
import Module, { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import backport from '../backport-next-image-socket.cjs';

const { VERSION, PINNED_FILES, applyBackport } = backport;
const dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = process.env.FR_NEXT_SOCKET_TEST_ROOT ?? path.resolve(dirname, '../..');
const projectRequire = createRequire(path.join(projectRoot, 'package.json'));
const nextRoot = path.dirname(projectRequire.resolve('next/package.json'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const originalSources = new Map(PINNED_FILES.map(spec => {
  let source = fs.readFileSync(path.join(nextRoot, spec.path), 'utf8');
  if (digest(source) === spec.patchedSha256) {
    for (const replacement of [...spec.replacements].reverse()) source = source.replace(replacement.after, replacement.before);
  }
  assert.equal(digest(source), spec.originalSha256, `Exact original ${VERSION} source required for regression: ${spec.path}`);
  return [spec.path, source];
}));
const patchedSource = spec => spec.replacements.reduce((source, replacement) => source.replace(replacement.before, replacement.after), originalSources.get(spec.path));
const cjsSpec = PINNED_FILES.find(spec => spec.path === 'dist/server/image-optimizer.js');
function compile(source) {
  const filename = path.join(nextRoot, cjsSpec.path);
  const compiled = new Module(filename);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled._compile(source, filename); // Memory only; no writes or require-cache replacement.
  return compiled.exports;
}
const oldOptimizer = compile(originalSources.get(cjsSpec.path));
const fixedOptimizer = compile(patchedSource(cjsSpec));
const { serveStatic } = projectRequire('next/dist/server/serve-static.js');
const { Batcher } = projectRequire('next/dist/lib/batcher.js');
const imagePath = path.join(projectRoot, 'public/place-photos/cunningham-falls.jpg');
const body = fs.readFileSync(imagePath);
assert.equal(digest(body), 'ef19e6723c497d0bb3f45f9605947c15489f601cd3678ed63dc2f2747597ffa6');
const href = '/place-photos/cunningham-falls.jpg';
function deadline(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise(resolve => { timer = setTimeout(() => resolve('deadline'), ms); })]).finally(() => clearTimeout(timer));
}
async function bounded(promise, ms = 2000) {
  const result = await deadline(promise, ms);
  assert.notEqual(result, 'deadline', `Internal file response must settle within ${ms}ms`);
  return result;
}
function closedSocket() { const socket = new Socket(); socket.destroy(); assert.equal(socket.writable, false); return socket; }
function fixture(t, version = VERSION) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-next-image-socket-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const packageRoot = path.join(root, 'node_modules/next');
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ name: 'next', version }));
  for (const spec of PINNED_FILES) {
    const target = path.join(packageRoot, spec.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, originalSources.get(spec.path));
  }
  return { root, packageRoot };
}
const snapshot = packageRoot => PINNED_FILES.map(spec => fs.readFileSync(path.join(packageRoot, spec.path)));
const unchanged = (packageRoot, before) => PINNED_FILES.forEach((spec, i) => assert.deepEqual(fs.readFileSync(path.join(packageRoot, spec.path)), before[i]));
const assertNoTemps = packageRoot => PINNED_FILES.forEach(spec => assert.equal(fs.readdirSync(path.dirname(path.join(packageRoot, spec.path))).some(name => name.includes('.fr-image-socket-')), false));

// This negative control uses the actual Next static sender and closed socket,
// rather than manufacturing a finish event or replacing the stream implementation.
test('old source remains pending on a closed outer socket; fixed source streams exact real bytes', async () => {
  const socket = closedSocket();
  let originalResponse;
  const old = oldOptimizer.fetchInternalImage(href, { method: 'GET', socket }, {}, body.length + 1, async (req, res) => {
    assert.equal(req.socket, socket); assert.equal(res.socket, socket); originalResponse = res;
    return serveStatic(req, res, imagePath);
  });
  assert.equal(await deadline(old.then(() => 'finished', () => 'rejected'), 200), 'deadline');
  originalResponse.destroy();
  const fixed = await bounded(fixedOptimizer.fetchInternalImage(href, { method: 'GET', socket }, {}, body.length + 1, async (req, res) => {
    assert.equal(req.socket, socket, 'Request keeps original connection metadata');
    assert.equal(res.socket, null, 'Independent internal response must not inherit client socket');
    return serveStatic(req, res, imagePath);
  }));
  assert.deepEqual(fixed.buffer, body); assert.equal(fixed.contentType, 'image/jpeg'); assert.ok(fixed.etag);
});

test('closed-socket same-key concurrent work completes once and a later pass completes again', async () => {
  const batcher = Batcher.create(); let calls = 0;
  const load = () => batcher.batch(href, () => {
    calls++;
    return fixedOptimizer.fetchInternalImage(href, { method: 'GET', socket: closedSocket() }, {}, body.length + 1, (req, res) => serveStatic(req, res, imagePath));
  });
  const [first, concurrent] = await bounded(Promise.all([load(), load()]));
  assert.deepEqual(first.buffer, body); assert.deepEqual(concurrent.buffer, body); assert.equal(calls, 1);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual((await bounded(load())).buffer, body); assert.equal(calls, 2);
});

test('request method, empty headers, URL and maximum-body limit retain existing semantics', async () => {
  for (const [method, expected] of [[undefined, 'GET'], ['HEAD', 'GET'], ['GET', 'GET'], ['POST', 'POST']]) {
    const socket = closedSocket();
    const result = await bounded(fixedOptimizer.fetchInternalImage(href, { method, socket }, {}, body.length + 1, async (req, res, parsed) => {
      assert.equal(req.method, expected); assert.deepEqual(req.headers, {}); assert.equal(req.url, href); assert.equal(parsed.pathname, href); assert.equal(req.socket, socket);
      res.end(body);
    }));
    assert.deepEqual(result.buffer, body);
  }
  await assert.rejects(bounded(fixedOptimizer.fetchInternalImage(href, { method: 'GET', socket: closedSocket() }, {}, body.length - 1, async (_req, res) => { res.end(body); })), error => error.statusCode === 413);
});

test('missing local file and empty handler body still reject', async () => {
  await assert.rejects(bounded(fixedOptimizer.fetchInternalImage(href, { method: 'GET', socket: closedSocket() }, {}, body.length + 1, (req, res) => serveStatic(req, res, `${imagePath}.missing`))), error => error.statusCode === 500);
  await assert.rejects(bounded(fixedOptimizer.fetchInternalImage(href, { method: 'GET', socket: closedSocket() }, {}, body.length + 1, async (_req, res) => { res.end(); })), error => error.statusCode === 400);
});

test('both exact patched full hashes and ESM syntax are checked without evaluating ESM dependencies', () => {
  for (const spec of PINNED_FILES) assert.equal(digest(patchedSource(spec)), spec.patchedSha256);
  execFileSync(process.execPath, ['--input-type=module', '--check'], { input: patchedSource(PINNED_FILES.find(spec => spec.path.startsWith('dist/esm/'))), stdio: ['pipe', 'pipe', 'pipe'] });
});

test('exact fake package is patched in both distributions and CLI is idempotent', t => {
  const { root, packageRoot } = fixture(t);
  fs.mkdirSync(path.join(root, 'scripts'));
  const script = path.join(root, 'scripts/backport-next-image-socket.cjs');
  fs.copyFileSync(path.join(dirname, '../backport-next-image-socket.cjs'), script);
  const run = () => JSON.parse(execFileSync(process.execPath, [script], { cwd: root, encoding: 'utf8' }));
  assert.equal(run().state, 'applied');
  for (const spec of PINNED_FILES) assert.equal(digest(fs.readFileSync(path.join(packageRoot, spec.path))), spec.patchedSha256);
  const before = PINNED_FILES.map(spec => fs.statSync(path.join(packageRoot, spec.path)).mtimeMs);
  assert.equal(run().state, 'already-applied');
  assert.deepEqual(PINNED_FILES.map(spec => fs.statSync(path.join(packageRoot, spec.path)).mtimeMs), before);
  assertNoTemps(packageRoot);
});

test('unknown version refuses both files without partial mutation', t => {
  const { packageRoot } = fixture(t, '16.3.9'); const before = snapshot(packageRoot);
  assert.throws(() => applyBackport(packageRoot), /requires exactly 16\.3\.8/);
  unchanged(packageRoot, before); assertNoTemps(packageRoot);
});

for (const changed of PINNED_FILES) test(`unknown hash in ${changed.path} refuses the complete pair`, t => {
  const { packageRoot } = fixture(t); fs.appendFileSync(path.join(packageRoot, changed.path), '\n// unknown package byte\n'); const before = snapshot(packageRoot);
  assert.throws(() => applyBackport(packageRoot), /unknown Next file hash/); unchanged(packageRoot, before); assertNoTemps(packageRoot);
});

for (const changed of PINNED_FILES) test(`mixed package with only ${changed.path} patched fails closed`, t => {
  const { packageRoot } = fixture(t); fs.writeFileSync(path.join(packageRoot, changed.path), patchedSource(changed)); const before = snapshot(packageRoot);
  assert.throws(() => applyBackport(packageRoot), /mixed original\/patched/); unchanged(packageRoot, before); assertNoTemps(packageRoot);
});

test('failure on second atomic rename restores first file and leaves no partial patch', t => {
  const { packageRoot } = fixture(t); const before = snapshot(packageRoot); const rename = fs.renameSync;
  let attempts = 0;
  fs.renameSync = function(...args) { if (++attempts === 2) throw new Error('Injected second rename failure'); return Reflect.apply(rename, this, args); };
  try { assert.throws(() => applyBackport(packageRoot), /Injected second rename failure/); } finally { fs.renameSync = rename; }
  unchanged(packageRoot, before); assertNoTemps(packageRoot);
});
