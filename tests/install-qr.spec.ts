import { readFileSync } from "node:fs";
import QRCode from "qrcode";
import { expect, it } from "vitest";

it("encodes the public setup route with the existing QR attribution in every module", async () => {
  const expected = await QRCode.toString(
    "https://frederickradius.app/install?utm_source=return_bridge&utm_medium=qr&utm_campaign=keep_radius",
    { type: "svg", errorCorrectionLevel: "M", margin: 4 },
  );
  const source = readFileSync("public/brand/return-bridge-qr.svg", "utf8");
  // QRCode's stroke path describes every dark module, row by row. Comparing
  // that complete path and its grid size verifies the encoded destination,
  // rather than trusting a label or merely checking that an image exists.
  const modulePath = (svg: string) => svg.match(/<path stroke="[^"]+" d="([^"]+)"/)?.[1];
  const grid = (svg: string) => svg.match(/viewBox="([^"]+)"/)?.[1];
  expect(modulePath(source)).toBeTruthy();
  expect(modulePath(source)).toBe(modulePath(expected));
  expect(grid(source)).toBe(grid(expected));
});
