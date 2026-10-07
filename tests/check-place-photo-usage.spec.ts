import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APPROVED,
  PENDING,
  SIGNAL_AWARE,
  auditPlacePhotoUsage,
  proxyMentions,
  stripComments,
} from "../scripts/check-place-photo-usage.mjs";

function tree(entries: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(entries));
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (path.startsWith(join("src", "app", "api"))) continue;
      sourceFiles(path, out);
    } else if (/\.(?:tsx|jsx)$/.test(entry.name) && !/\.(?:spec|test|stories)\./.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

describe("check-place-photo-usage", () => {
  it("passes on the current tree", () => {
    const files = new Map(
      sourceFiles("src").map((path) => [
        relative(".", path).split(sep).join("/"),
        readFileSync(path, "utf8"),
      ]),
    );
    expect(auditPlacePhotoUsage(files).failures).toEqual([]);
  });

  it("fails a new component that paints the proxy with a plain Image", () => {
    const { failures } = auditPlacePhotoUsage(
      tree({
        "src/components/today/NewShelf.tsx": [
          'import Image from "next/image";',
          "export function Thumb({ src }: { src: string }) {",
          '  return <Image src={src} alt="" fill unoptimized={src.startsWith("/api/place-photo")} />;',
          "}",
        ].join("\n"),
      }),
    );

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("src/components/today/NewShelf.tsx:3");
  });

  it("fails a component that builds a proxy URL for an img src", () => {
    const { failures } = auditPlacePhotoUsage(
      tree({
        "src/components/place/Strip.tsx":
          "export const Strip = ({ n }: { n: string }) => <img alt=\"\" src={`/api/place-photo?name=${n}`} />;",
      }),
    );

    expect(failures).toHaveLength(1);
  });

  it("allows the primitive, its helpers and the pending list", () => {
    const paint = 'unoptimized={src.startsWith("/api/place-photo")}';
    const entries: Record<string, string> = {};
    for (const file of [...APPROVED, ...PENDING]) entries[file] = paint;

    expect(auditPlacePhotoUsage(tree(entries)).failures).toEqual([]);
  });

  it("fails a signal-aware file that loses its failure-signal handling", () => {
    const [file] = [...SIGNAL_AWARE];
    const { failures } = auditPlacePhotoUsage(
      tree({ [file]: 'unoptimized={src.startsWith("/api/place-photo")}' }),
    );

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("no longer requests or checks the failure signal");
  });

  it("notices a listed file that no longer touches the proxy", () => {
    const [file] = [...PENDING];
    const { failures, notices } = auditPlacePhotoUsage(
      tree({ [file]: "export const x = 1;" }),
    );

    expect(failures).toEqual([]);
    expect(notices).toEqual([`${file} no longer mentions the proxy; remove its entry.`]);
  });

  it("ignores the path in comments, even after an apostrophe in JSX text", () => {
    const source = [
      "export function Note() {",
      "  return <p>Here's the plan.</p>; // reads /api/place-photo upstream",
      "}",
      "/* The /api/place-photo proxy answers failures with a 200. */",
    ].join("\n");

    expect(proxyMentions(source)).toEqual([]);
    expect(stripComments(source).split("\n")).toHaveLength(4);
  });
});
