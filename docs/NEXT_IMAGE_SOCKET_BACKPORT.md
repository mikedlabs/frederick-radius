# Internal image response cancellation

Next16.4.2 includes the internal image response fix upstream in both its
CommonJS and ESM distributions. The temporary Next16.3.8 backport and its npm
postinstall hook have been removed. Install the exact reviewed package and
lockfile normally; this application no longer modifies Next's vendor files.

The released image optimizer contains the image-local change from
[merged Next.js PR98168](https://github.com/vercel/next.js/pull/98168/files).
Its internal request retains the requesting socket for connection metadata.
Its response is a separate mock response without that socket. A disconnected
client therefore cannot terminate the internal file stream while leaving
shared image work pending. The shared mock factory remains unchanged.

A bounded local experiment reproduced the original Next16.3.8 hang before
the image encoder. The exact originating cancellation in the hosted WebKit
failure remains unproved; the upstream repair is not evidence that every
browser loading failure has the same cause.

The focused regression runs with:

```sh
node --test scripts/lib/next-image-socket.test.mjs
```

It tests the actual installed, unmodified Next image optimizer with Next's
real static sender and the exact committed local image bytes. Its strict
negative control changes only the response/socket coupling in memory to
reproduce the old pending response; it does not replace the static sender or
manufacture stream completion. The released implementation must finish that
same request and concurrent same-key work, then serve a subsequent request.

The regression also checks that the internal request uses empty headers,
never reads private outer headers or the outer response, and preserves its
connection metadata even when other socket accessors throw. Method handling,
body limits, empty/missing files and non-success statuses remain covered.
It compares the CJS and ESM response construction and checks ESM syntax.
Vendor integrity comes from the exact dependency lockfile rather than a
second application-owned hash or patch system. ESM runtime bundling and the
public mobile flow still require their normal application release gates.

The runtime security update is separate from a lint-analyzer migration.
Development uses the previously reviewed eslint-config-next16.3.8 and pins
eslint-plugin-react-hooks7.0.1, its prior resolved version. The application
ESLint configuration and enabled rules are unchanged. Newer analyzer
diagnostics affecting existing components need a separate reviewed migration;
they do not require holding back the patched Next runtime. Production audit
and the normal complete lint check remain required release checks.
