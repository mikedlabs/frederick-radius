import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// The public scan excludes the internal pitch token block in globals.css by a
// start and an end marker. If either marker disappears, the scan must stop
// instead of silently excluding the rest of the file or scanning the pitch
// block as public app code.
const script = fileURLToPath(new URL("../scripts/devibe_scan.py", import.meta.url));

const PROBE = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("devibe_scan", sys.argv[1])
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
lines = json.loads(sys.argv[2])
path = mod.os.path.join(mod.PROJECT_ROOT, "src", "app", "globals.css")
print(json.dumps(sorted(mod.public_excluded_lines(path, lines))))
`;

function probe(lines) {
  return spawnSync("python3", ["-I", "-c", PROBE, script, JSON.stringify(lines)], {
    encoding: "utf8",
  });
}

test("excludes exactly the lines between the pitch markers", () => {
  const result = probe([
    "a {}\n",
    "/* INTERNAL PITCH DECK */\n",
    "b {}\n",
    "/* Product identity */\n",
    "c {}\n",
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [2, 3, 4]);
});

test("fails when the start marker has no end marker", () => {
  const result = probe(["a {}\n", "/* INTERNAL PITCH DECK */\n", "b {}\n"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /no end marker/);
});

test("fails when the end marker has no start marker", () => {
  const result = probe(["a {}\n", "b {}\n", "/* Product identity */\n"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /without a preceding start marker/);
});
