import { constants, closeSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const CASES = [
  { spec: "today-map-visual-depth", png: "today390-arrival-fixture.png" },
  { spec: "today-map-visual-depth", png: "map320-owned-photo-metadata-pending-fixture.png" },
  { spec: "events-nearby-visual-cards", png: "events-390-discovery.png" },
];
const LIMITS = { chromium: 2 * 1024 * 1024, "webkit-mobile": 10 * 1024 * 1024 };
const SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");
const END = Buffer.from("0000000049454e44ae426082", "hex");

function directory(path) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Evidence directories must be real directories, without symlinks");
}

// Case titles and Playwright hashes may change. Spec owners, PNG basenames,
// engine suffixes and the single-retry boundary remain exact.
export function prepareVisualFixtureArtifact(workspaceRoot, engine) {
  if (!Object.hasOwn(LIMITS, engine)) throw new Error("Unknown evidence engine");
  const workspace = resolve(workspaceRoot);
  directory(workspace);
  const input = join(workspace, "test-results");
  directory(input);
  const children = readdirSync(input);
  const selected = [];
  const owners = new Map(CASES.map(({ spec, png }) => [png, spec]));
  const seen = new Map();
  let totalBytes = 0;
  for (const name of children) {
    const match = /^((today-map-visual-depth|events-nearby-visual-cards)-.+)-(chromium|webkit-mobile)(.*)$/.exec(name);
    if (!match || match[3] !== engine) continue;
    const [, stem, spec, , attempt] = match;
    if (attempt !== "" && attempt !== "-retry1") throw new Error("Unexpected fixture attempt path; maximum one retry is allowed");
    const casePath = join(input, name);
    directory(casePath);
    const files = readdirSync(casePath);
    if (!files.some((filename) => owners.has(filename))) continue; // Other captures remain outside this allowlist.
    for (const filename of files) {
      const stat = lstatSync(join(casePath, filename));
      if (stat.isSymbolicLink()) throw new Error("Symlinks are forbidden in selected fixture directories");
      if (/\.png$/i.test(filename) && !owners.has(filename)) throw new Error("Unknown PNG basename in selected fixture directory");
      if (!owners.has(filename)) continue;
      if (owners.get(filename) !== spec) throw new Error("Fixture PNG is outside its owning spec prefix");
      const prior = seen.get(filename);
      if (prior && prior.stem !== stem) throw new Error("Multiple case stems for one fixture PNG");
      if (prior?.attempts.has(attempt)) throw new Error("Duplicate fixture PNG attempt");
      const identity = prior ?? { stem, attempts: new Set() };
      identity.attempts.add(attempt);
      seen.set(filename, identity);
      const path = join(casePath, filename);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Selected PNG must be a regular file, without symlinks");
      totalBytes += stat.size;
      if (totalBytes > LIMITS[engine]) throw new Error("Fixture PNG byte budget exceeded");
      selected.push({ path, directory: name, filename, size: stat.size });
    }
  }
  for (const { png } of CASES) if (!seen.has(png)) throw new Error(`Missing expected fixture PNG: ${png}`);
  if (selected.length < 3 || selected.length > 6) throw new Error("Expected three to six fixture PNGs");
  const buffers = selected.map((file) => {
    const fd = openSync(file.path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.size !== file.size) throw new Error("Fixture PNG changed during preflight");
      // One extra byte detects growth without ever reading an unbounded file.
      const buffer = Buffer.alloc(file.size + 1);
      let count = 0;
      while (count < buffer.length) {
        const read = readSync(fd, buffer, count, buffer.length - count, count);
        if (!read) break;
        count += read;
      }
      if (count !== file.size) throw new Error("Fixture PNG changed during preflight");
      const data = buffer.subarray(0, count);
      // Structural type check only; the existing browser tests own actual
      // decoded imagery, credits, touch targets and navigation assertions.
      if (data.length < 45 || !data.subarray(0, 8).equals(SIGNATURE)
        || data.readUInt32BE(8) !== 13 || data.toString("ascii", 12, 16) !== "IHDR"
        || !data.readUInt32BE(16) || !data.readUInt32BE(20)
        || !data.subarray(-12).equals(END)) throw new Error("Selected file is not a structurally identified PNG");
      return { ...file, data };
    } finally { closeSync(fd); }
  });
  const parent = join(workspace, "ci-visual-fixtures");
  if (existsSync(parent)) directory(parent);
  else mkdirSync(parent);
  const output = join(parent, engine);
  // Exclusive creation keeps old evidence or symlinks out of a rerun's upload.
  mkdirSync(output);
  const folders = new Set();
  for (const file of buffers) {
    const folder = join(output, file.directory);
    if (!folders.has(folder)) { mkdirSync(folder); folders.add(folder); }
    writeFileSync(join(folder, file.filename), file.data, { flag: "wx", mode: 0o600 });
  }
  return { engine, count: selected.length, bytes: totalBytes, output };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = prepareVisualFixtureArtifact(process.cwd(), process.argv[2]);
  console.log(`${result.engine}: ${result.count} allowlisted fixture PNGs, ${result.bytes} bytes. Fixture visuals only; retry directories retained.`);
}
