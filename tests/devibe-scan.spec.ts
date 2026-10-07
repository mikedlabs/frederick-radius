import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";

const SCRIPT = resolve(process.cwd(), "scripts/devibe_scan.py");
const hasPython = spawnSync("python3", ["--version"]).status === 0;

type Finding = { rule: string; sev: string; line: number; file: string };

const dir = mkdtempSync(join(tmpdir(), "devibe-scan-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function scan(name: string, source: string): Finding[] {
  writeFileSync(join(dir, name), source);
  const result = spawnSync(
    "python3",
    [SCRIPT, join(dir, name), "--json", "--surface", "all"],
    { encoding: "utf8" },
  );
  expect(result.error).toBeUndefined();
  return (JSON.parse(result.stdout) as { findings: Finding[] }).findings;
}

describe.skipIf(!hasPython)("devibe_scan JSX style-object patterns", () => {
  it("flags gradient text written as a React style object (the #1702 regression)", () => {
    const findings = scan(
      "GradientTitle.tsx",
      [
        "export function Title() {",
        "  return (",
        "    <span",
        "      style={{",
        '        backgroundImage: "linear-gradient(110deg, var(--app-ink) 30%, var(--app-brand))",',
        '        WebkitBackgroundClip: "text",',
        '        WebkitTextFillColor: "transparent",',
        "      }}",
        "    >Title</span>",
        "  );",
        "}",
      ].join("\n"),
    );

    expect(findings).toEqual([
      expect.objectContaining({ rule: "gradient-text", sev: "high", line: 6 }),
    ]);
  });

  it("flags the unprefixed backgroundClip style key with either quote style", () => {
    const findings = scan(
      "ClipVariants.tsx",
      [
        "const a = { backgroundClip: 'text' };",
        'const b = { backgroundClip: "padding-box" };',
      ].join("\n"),
    );

    expect(findings.map((f) => [f.rule, f.line])).toEqual([["gradient-text", 1]]);
  });

  it("flags staggered list fades in Framer Motion variants (the #1688 regression)", () => {
    const findings = scan(
      "StaggerList.tsx",
      [
        "const container = {",
        "  hidden: { opacity: 0 },",
        "  show: { opacity: 1, transition: { staggerChildren: 0.05 } },",
        "};",
      ].join("\n"),
    );

    expect(findings).toEqual([
      expect.objectContaining({ rule: "fade-in-animations", sev: "medium", line: 3 }),
    ]);
  });

  it("leaves a solid ink heading alone", () => {
    const findings = scan(
      "SolidTitle.tsx",
      'export const Title = () => <h2 style={{ color: "var(--app-ink)" }}>Worth your time</h2>;\n',
    );

    expect(findings).toEqual([]);
  });
});
