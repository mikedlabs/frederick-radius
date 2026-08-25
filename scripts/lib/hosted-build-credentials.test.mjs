import assert from "node:assert/strict";
import test from "node:test";
import { hostedBuildCredentialErrors } from "./hosted-build-credentials.mjs";

test("does not require hosted credentials for local or ordinary CI builds", () => {
  assert.deepEqual(hostedBuildCredentialErrors({}), []);
  assert.deepEqual(hostedBuildCredentialErrors({ VERCEL_ENV: "development" }), []);
});

for (const hostedEnvironment of ["production", "preview"]) {
  test(`blocks a ${hostedEnvironment} build without the browser map token`, () => {
    assert.deepEqual(
      hostedBuildCredentialErrors({ VERCEL_ENV: hostedEnvironment }),
      [
        `NEXT_PUBLIC_MAPBOX_TOKEN is required for Vercel ${hostedEnvironment} builds`,
      ],
    );
  });

  test(`accepts a publishable browser token for ${hostedEnvironment}`, () => {
    assert.deepEqual(
      hostedBuildCredentialErrors({
        VERCEL_ENV: hostedEnvironment,
        NEXT_PUBLIC_MAPBOX_TOKEN: "pk.test-browser-token",
      }),
      [],
    );
  });
}

test("rejects a secret token in the public browser variable", () => {
  assert.deepEqual(
    hostedBuildCredentialErrors({
      VERCEL_ENV: "production",
      NEXT_PUBLIC_MAPBOX_TOKEN: "sk.must-not-ship",
    }),
    ["NEXT_PUBLIC_MAPBOX_TOKEN must be a publishable Mapbox pk. token"],
  );
});
