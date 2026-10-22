import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { Socket } from 'node:net';
import Module, { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = process.env.FR_NEXT_SOCKET_TEST_ROOT ?? path.resolve(dirname, '../..');
const projectRequire = createRequire(path.join(projectRoot, 'package.json'));
const nextRoot = path.dirname(projectRequire.resolve('next/package.json'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const cjsFilename = path.join(nextRoot, 'dist/server/image-optimizer.js');
const cjsSource = fs.readFileSync(cjsFilename, 'utf8');
const esmSource = fs.readFileSync(path.join(nextRoot, 'dist/esm/server/image-optimizer.js'), 'utf8');
// Exercise the actual unmodified released dependency, not an application patch.
const fixedOptimizer = projectRequire('next/dist/server/image-optimizer.js');
const { serveStatic } = projectRequire('next/dist/server/serve-static.js');
const { Batcher } = projectRequire('next/dist/lib/batcher.js');
const imagePath = path.join(projectRoot, 'public/place-photos/cunningham-falls.jpg');
const body = fs.readFileSync(imagePath);
assert.equal(digest(body), 'ef19e6723c497d0bb3f45f9605947c15489f601cd3678ed63dc2f2747597ffa6');
const href = '/place-photos/cunningham-falls.jpg';

// Strict negative control: restore only the old response/socket coupling in
// memory. The real Next static sender must reproduce the original pending work.
const separateResponse = 'res: new _mockrequest.MockedResponse({\n                maximumResponseBody\n            })';
assert.equal(cjsSource.split(separateResponse).length, 2, 'Review an upstream change to the internal response construction');
const regressionSource = cjsSource.replace(separateResponse, 'res: new _mockrequest.MockedResponse({\n                socket: _req.socket,\n                maximumResponseBody\n            })');
const regressed = new Module(cjsFilename);
regressed.filename = cjsFilename;
regressed.paths = Module._nodeModulePaths(path.dirname(cjsFilename));
regressed._compile(regressionSource, cjsFilename);
const regressedOptimizer = regressed.exports;

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

test('released Next retains the image-local fix in both distributions without a vendor postinstall patch', () => {
  const installed = projectRequire('next/package.json').version;
  const declared = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package-lock.json'), 'utf8'));
  assert.equal(installed, declared.dependencies.next);
  assert.equal(installed, lock.packages['node_modules/next'].version);
  assert.ok(lock.packages['node_modules/next'].integrity);
  assert.doesNotMatch(declared.scripts.postinstall ?? '', /backport-next-image-socket/);
  assert.equal(fs.existsSync(path.join(projectRoot, 'scripts/backport-next-image-socket.cjs')), false);
  const construction = source => {
    const blocks = source.match(/const mocked = \{\n[\s\S]*?\n        \};/g);
    assert.equal(blocks?.length, 1);
    return blocks[0].replaceAll('_mockrequest.', '');
  };
  assert.equal(construction(cjsSource), construction(esmSource));
  execFileSync(process.execPath, ['--input-type=module', '--check'], { input: esmSource, stdio: ['pipe', 'pipe', 'pipe'] });
});

test('negative control remains pending on a closed outer socket; released Next streams exact real bytes', async () => {
  const socket = closedSocket();
  let originalResponse;
  const old = regressedOptimizer.fetchInternalImage(href, { method: 'GET', socket }, {}, body.length + 1, async (req, res) => {
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

test('image-local request keeps connection metadata without reading or forwarding private outer headers', async () => {
  const socket = new Proxy({}, { get(_target, property) {
    if (property === 'encrypted') return true;
    if (property === 'remoteAddress') return '192.0.2.1';
    throw new Error(`Unexpected outer socket access: ${String(property)}`);
  } });
  let socketReads = 0;
  const outer = { method: 'GET', get socket() { socketReads++; return socket; }, get headers() { throw new Error('Private outer headers must not be read'); } };
  const outerResponse = new Proxy({}, { get() { throw new Error('Outer response must not be read'); } });
  const result = await bounded(fixedOptimizer.fetchInternalImage(href, outer, outerResponse, body.length + 1, (req, res) => {
    assert.deepEqual(req.headers, {}); assert.equal(req.socket, socket); assert.equal(req.socket.encrypted, true); assert.equal(req.socket.remoteAddress, '192.0.2.1');
    assert.equal(res.socket, null);
    return serveStatic(req, res, imagePath);
  }));
  assert.equal(socketReads, 1); assert.deepEqual(result.buffer, body);
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

test('missing local file, empty handler body and non-success statuses still reject', async () => {
  await assert.rejects(bounded(fixedOptimizer.fetchInternalImage(href, { method: 'GET', socket: closedSocket() }, {}, body.length + 1, (req, res) => serveStatic(req, res, `${imagePath}.missing`))), error => error.statusCode === 500);
  await assert.rejects(bounded(fixedOptimizer.fetchInternalImage(href, { method: 'GET', socket: closedSocket() }, {}, body.length + 1, async (_req, res) => { res.end(); })), error => error.statusCode === 400);
  for (const status of [301, 404, 500]) {
    await assert.rejects(bounded(fixedOptimizer.fetchInternalImage(href, { method: 'GET', socket: closedSocket() }, {}, body.length + 1, async (_req, res) => { res.statusCode = status; res.end(body); })), error => error.statusCode === (status >= 400 ? status : 500));
  }
});
