import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// Exit 1 builds, exit 0 skips (Vercel's Ignored Build Step contract).
const SCRIPT = resolve(__dirname, "../scripts/vercel-ignore-preview.sh");
const BUILD = 1;
const SKIP = 0;

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

function write(cwd: string, path: string, body = "x\n") {
  mkdirSync(dirname(join(cwd, path)), { recursive: true });
  writeFileSync(join(cwd, path), body);
}

function commit(cwd: string, files: string[], message: string) {
  for (const file of files) write(cwd, file, `${message}\n`);
  git(cwd, "add", "-A");
  git(cwd, "-c", "user.email=t@example.org", "-c", "user.name=t", "commit", "-qm", message);
}

/** A bare origin with an app on main, and a clone checked out on `branch`. */
function repo(branch: string) {
  const root = mkdtempSync(join(tmpdir(), "vercel-ignore-"));
  roots.push(root);
  const origin = join(root, "origin.git");
  const seed = join(root, "seed");
  git(root, "init", "-q", "--bare", "-b", "main", origin);
  git(root, "init", "-q", "-b", "main", seed);
  commit(seed, ["package.json", "src/app/page.tsx", "src/app/globals.css", "src/components/Card.tsx", "docs/README.md"], "app");
  git(seed, "remote", "add", "origin", origin);
  git(seed, "push", "-q", "origin", "main");
  const work = join(root, "work");
  git(root, "clone", "-q", origin, work);
  git(work, "checkout", "-q", "-b", branch);
  return work;
}

function run(cwd: string, env: Record<string, string> = {}) {
  const result = spawnSync("bash", [SCRIPT], {
    cwd,
    encoding: "utf8",
    // Only the variables the helper reads, so the host's VERCEL_* never leak in.
    env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", VERCEL_ENV: "preview", ...env },
  });
  return { status: result.status, out: result.stdout };
}

describe("vercel-ignore-preview.sh", () => {
  it("always builds production", () => {
    const work = repo("claude/docs");
    commit(work, ["docs/README.md"], "docs only");
    expect(run(work, { VERCEL_ENV: "production" }).status).toBe(BUILD);
  });

  it.each([
    ["a page", "src/app/events/page.tsx"],
    ["globals.css", "src/app/globals.css"],
    ["a component", "src/components/Card.tsx"],
  ])("builds a preview for a branch that changes %s", (_label, file) => {
    const work = repo("claude/ui");
    commit(work, [file], "ui change");
    expect(run(work).status).toBe(BUILD);
  });

  it("counts a UI commit pushed before a later docs-only commit", () => {
    const work = repo("claude/ui-then-docs");
    commit(work, ["src/components/Card.tsx"], "ui change");
    commit(work, ["docs/README.md"], "docs follow-up");
    const result = run(work);
    expect(result.status).toBe(BUILD);
    expect(result.out).toContain("(main)");
  });

  it.each([
    ["docs", "docs/README.md"],
    ["data", "src/data/places-client.json"],
    ["a library helper", "src/lib/format/time.ts"],
    ["a workflow", ".github/workflows/ci.yml"],
  ])("skips a branch that only changes %s", (_label, file) => {
    const work = repo("claude/other");
    commit(work, [file], "non-ui change");
    const result = run(work);
    expect(result.status).toBe(SKIP);
    expect(result.out).toContain("build skipped");
  });

  it("ignores UI changes that landed on main after the branch forked", () => {
    const work = repo("claude/docs-behind");
    commit(work, ["docs/README.md"], "docs only");
    const ahead = join(dirname(work), "ahead");
    git(dirname(work), "clone", "-q", join(dirname(work), "origin.git"), ahead);
    commit(ahead, ["src/app/page.tsx"], "main moved");
    git(ahead, "push", "-q", "origin", "main");
    expect(run(work).status).toBe(SKIP);
  });

  it("skips the data-snapshots branch, which carries no app tree", () => {
    const root = mkdtempSync(join(tmpdir(), "vercel-ignore-"));
    roots.push(root);
    git(root, "init", "-q", "-b", "data-snapshots");
    commit(root, ["data/clean/nws_forecast.json", "scripts/vercel-ignore-preview.sh"], "snapshot");
    const result = run(root);
    expect(result.status).toBe(SKIP);
    expect(result.out).toContain("no app tree");
  });

  it("falls back to the parent commit when main cannot be fetched", () => {
    const root = mkdtempSync(join(tmpdir(), "vercel-ignore-"));
    roots.push(root);
    git(root, "init", "-q", "-b", "claude/no-origin");
    commit(root, ["package.json", "src/app/page.tsx"], "app");
    commit(root, ["docs/README.md"], "docs only");
    const result = run(root);
    expect(result.status).toBe(SKIP);
    expect(result.out).toContain("(the parent commit)");
  });

  it("builds when there is no commit to compare against", () => {
    const root = mkdtempSync(join(tmpdir(), "vercel-ignore-"));
    roots.push(root);
    git(root, "init", "-q", "-b", "lonely");
    commit(root, ["package.json", "src/app/page.tsx"], "only commit");
    expect(run(root).status).toBe(BUILD);
  });
});
