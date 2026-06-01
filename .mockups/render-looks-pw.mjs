import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const dir = ".mockups";
const out = path.join(dir, "render");
fs.mkdirSync(out, { recursive: true });

// The distinct design directions (skip the NORTHSTAR/live app captures).
const LOOKS = [
  "a-intent", "b-fieldguide", "b1-naturalist", "b2-topo", "b3-nocturne",
  "b4-cover", "c-editorial", "FIND-somewhere-good", "GUIDED-home",
  "WHATS-ON-weekend", "FIELDGUIDE-specimen-key",
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 440, height: 920 }, deviceScaleFactor: 2 });
const done = [];
for (const name of LOOKS) {
  const html = path.join(dir, name + ".html");
  if (!fs.existsSync(html)) { console.log("skip (missing)", name); continue; }
  await page.goto("file://" + path.resolve(html), { waitUntil: "networkidle" });
  const p = path.join(out, name + ".png");
  await page.screenshot({ path: p, fullPage: true });
  const kb = Math.round(fs.statSync(p).size / 1024);
  done.push(name);
  console.log("rendered", name, kb + "kb");
}
await browser.close();
console.log("\nDONE:", done.length, "looks →", out);
