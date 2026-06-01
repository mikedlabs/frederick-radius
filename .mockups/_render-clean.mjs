import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const ICON_DIR = "node_modules/lucide-react/dist/esm/icons";
function svgFor(name) {
  const file = path.join(ICON_DIR, name + ".js");
  if (!fs.existsSync(file)) { console.log("MISSING ICON", name); return ""; }
  const src = fs.readFileSync(file, "utf8");
  const m = src.match(/const __iconNode = (\[[\s\S]*?\]);\s*\nconst /);
  if (!m) { console.log("PARSE FAIL", name); return ""; }
  const nodes = eval("(" + m[1] + ")"); // array literal, safe local source
  const inner = nodes.map(([tag, attrs]) => {
    const a = Object.entries(attrs)
      .filter(([k]) => k !== "key")
      .map(([k, v]) => `${k}="${v}"`)
      .join(" ");
    return `<${tag} ${a}/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

let html = fs.readFileSync(".mockups/RADIUS-clean.html", "utf8");
// remove the CDN script + the createIcons call (we inline instead)
html = html.replace(/<script src="https:\/\/unpkg[^>]*><\/script>/, "");
html = html.replace(/<script>window\.addEventListener[\s\S]*?<\/script>/, "");
// replace every <i data-lucide="NAME"></i> with the inline svg
html = html.replace(/<i data-lucide="([^"]+)"><\/i>/g, (_, n) => svgFor(n));
fs.writeFileSync(".mockups/RADIUS-clean.built.html", html);

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 });
await p.goto("file://" + path.resolve(".mockups/RADIUS-clean.built.html"), { waitUntil: "networkidle" });
await p.waitForTimeout(500);
const svgs = await p.evaluate(() => document.querySelectorAll("svg").length);
await p.screenshot({ path: ".mockups/render/RADIUS-clean.png", fullPage: true });
await b.close();
console.log("rendered RADIUS-clean.png · inline svgs:", svgs);
