'use strict';

/* eslint-disable @typescript-eslint/no-require-imports -- Node postinstall uses this synchronous CommonJS entry point. */

// Narrow backport of merged Next.js PR98168 (patch476f5dd). Remove after a
// reviewed released package ships this image-local fix. Never patch the factory.
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const VERSION = '16.3.8';
const PINNED_FILES = [
  {
    "path": "dist/server/image-optimizer.js",
    "originalSha256": "38b92fde5bc72aa23c999d283052da11a6dfb36be75c2d92683d539551065a3c",
    "patchedSha256": "27172a46880c726a855f020a89dcdcc028b9eaf11b55ac4352505382598f0a63",
    "replacements": [
      {
        "before": "        const mocked = (0, _mockrequest.createRequestResponseMocks)({\n            url: href,\n            method,\n            socket: _req.socket,\n            maximumResponseBody\n        });",
        "after": "        const mocked = {\n            req: new _mockrequest.MockedRequest({\n                url: href,\n                method,\n                headers: {},\n                socket: _req.socket\n            }),\n            res: new _mockrequest.MockedResponse({\n                maximumResponseBody\n            })\n        };"
      }
    ]
  },
  {
    "path": "dist/esm/server/image-optimizer.js",
    "originalSha256": "b5dd6849f39477e7e17f61e3428d53a548f2d83d8837fb03274ab59a4f576f34",
    "patchedSha256": "17f3b6cc36d9b4e25bcda4ece1b006481030811e383ae7c96ec08e32cf00aa4d",
    "replacements": [
      {
        "before": "import { createRequestResponseMocks } from './lib/mock-request';",
        "after": "import { MockedRequest, MockedResponse } from './lib/mock-request';"
      },
      {
        "before": "        const mocked = createRequestResponseMocks({\n            url: href,\n            method,\n            socket: _req.socket,\n            maximumResponseBody\n        });",
        "after": "        const mocked = {\n            req: new MockedRequest({\n                url: href,\n                method,\n                headers: {},\n                socket: _req.socket\n            }),\n            res: new MockedResponse({\n                maximumResponseBody\n            })\n        };"
      }
    ]
  }
];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function inspect(packageRoot) {
  const root = fs.realpathSync(packageRoot);
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  if (version !== VERSION) throw new Error(`Refusing Next ${version}: backport requires exactly ${VERSION}`);
  const files = PINNED_FILES.map(spec => {
    const filename = path.join(root, spec.path);
    const stat = fs.lstatSync(filename);
    if (!stat.isFile() || fs.realpathSync(filename) !== filename) throw new Error(`Refusing non-regular or linked vendor file: ${spec.path}`);
    const original = fs.readFileSync(filename);
    const sha256 = digest(original);
    const state = sha256 === spec.originalSha256 ? 'original' : sha256 === spec.patchedSha256 ? 'patched' : 'unknown';
    if (state === 'unknown') throw new Error(`Refusing unknown Next file hash: ${spec.path} (${sha256})`);
    return { spec, filename, original, mode: stat.mode & 0o777, state };
  });
  if (files.some(file => file.state !== files[0].state)) throw new Error('Refusing mixed original/patched Next files; reinstall the exact locked package before retrying');
  return { root, files, state: files[0].state };
}

function patchedBytes(file) {
  let source = file.original.toString('utf8');
  for (const replacement of file.spec.replacements) {
    if (source.split(replacement.before).length !== 2) throw new Error(`Expected one exact image-local replacement in ${file.spec.path}`);
    source = source.replace(replacement.before, replacement.after);
  }
  const bytes = Buffer.from(source);
  if (digest(bytes) !== file.spec.patchedSha256) throw new Error(`Patched full-file hash mismatch: ${file.spec.path}`);
  return bytes;
}

function stageFile(filename, bytes, mode, staged) {
  const temporary = `${filename}.fr-image-socket-${randomUUID()}.tmp`;
  staged.push(temporary);
  const fd = fs.openSync(temporary, 'wx', mode);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  return temporary;
}

function applyBackport(packageRoot) {
  const snapshot = inspect(packageRoot); // Validate BOTH full hashes before any target mutation.
  const summary = state => ({ next: VERSION, state, files: PINNED_FILES.map(({ path, patchedSha256 }) => ({ path, sha256: patchedSha256 })) });
  if (snapshot.state === 'patched') return summary('already-applied');
  const staged = [], committed = [];
  let primaryError;
  try {
    const prepared = snapshot.files.map(file => ({ ...file, temporary: stageFile(file.filename, patchedBytes(file), file.mode, staged) }));
    // All replacements are staged. Revalidate the pair/version immediately before renames.
    if (inspect(snapshot.root).state !== 'original') throw new Error('Next files changed while backport was being staged');
    for (const file of prepared) { fs.renameSync(file.temporary, file.filename); committed.push(file); }
    if (inspect(snapshot.root).state !== 'patched') throw new Error('Next backport final verification failed');
    return summary('applied');
  } catch (error) {
    const rollbackErrors = [];
    for (const file of committed.reverse()) {
      try {
        const current = digest(fs.readFileSync(file.filename));
        if (current === file.spec.originalSha256) continue;
        if (current !== file.spec.patchedSha256) throw new Error(`Refusing to overwrite concurrently changed file during rollback: ${file.spec.path}`);
        fs.renameSync(stageFile(file.filename, file.original, file.mode, staged), file.filename);
      } catch (rollbackError) { rollbackErrors.push(rollbackError); }
    }
    primaryError = rollbackErrors.length ? new AggregateError([error, ...rollbackErrors], 'Next backport failed and rollback was incomplete; reinstall the exact locked package') : error;
    throw primaryError;
  } finally {
    const cleanupErrors = [];
    for (const temporary of staged) {
      try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') cleanupErrors.push(error); }
    }
    if (cleanupErrors.length && !primaryError) throw new AggregateError(cleanupErrors, 'Next backport temporary-file cleanup failed');
  }
}

module.exports = { VERSION, PINNED_FILES, applyBackport };
if (require.main === module) {
  try {
    const projectRoot = path.resolve(__dirname, '..');
    const packageRoot = path.dirname(require.resolve('next/package.json', { paths: [projectRoot] }));
    console.log(JSON.stringify(applyBackport(packageRoot)));
  } catch (error) {
    console.error(`[next-image-socket-backport] ${error.message}`);
    process.exitCode = 1;
  }
}
