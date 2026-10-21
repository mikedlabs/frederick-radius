# Internal image response cancellation

Next16.3.8 can leave an internal image response pending when its requesting
client socket closes. Later requests for the same optimization key can then
wait on the unfinished shared work. A bounded local experiment reproduced
this before the image encoder; the exact originating cancellation in the
hosted WebKit failure remains unproved.

`scripts/backport-next-image-socket.cjs` applies the image-local change from
[merged Next.js PR98168](https://github.com/vercel/next.js/pull/98168/files)
(patch476f5dd). The internal request retains the real request socket. Its
response is a separate mock response without the client socket. The shared mock factory, body limits,
encoding formats, cache keys and image assertions remain unchanged.

The npm postinstall hook accepts only Next16.3.8 and the full known original
or patched SHA256 pair for its CommonJS and ESM image optimizers. Unknown
versions, unknown bytes, linked files and mixed original/patched pairs fail
installation. Both files are validated and staged before either is replaced;
handled replacement failures roll back completed replacements. Replacement is
atomic per file, not across both files. An abrupt process or power failure
between replacements can leave a mixed pair. Reinstall the exact locked
package to recover; do not reset the guards to accept unknown bytes.

The focused regression runs with:

```sh
node --test scripts/lib/next-image-socket-backport.test.mjs
```

It compiles pinned old and patched sources in memory and uses Next's real
static sender with a destroyed client socket. The old response stays pending
within the negative-control deadline; the repaired response must return the
exact committed local image bytes. It also exercises concurrent same-key
batching, request semantics, body limits, errors, both distribution hashes,
ESM syntax, idempotence, refusal guards and rollback. ESM runtime bundling and
the full public mobile flow require their normal application release gates.

Retire the lifecycle hook and backport after reviewing a released Next
package that contains this fix and running the regression with that package.
Update the lockfile using npm10. Do not bypass an unknown-version refusal by
silently skipping the repair or widening its hashes.
