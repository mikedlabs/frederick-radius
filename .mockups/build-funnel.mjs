// Frederick Radius — the FUNNEL front door, made visible.
// Open -> "What are you after?" -> narrow (context auto-applied) -> answer.
// The pizza run, in 3 taps. SVG -> PNG via sharp (no browser).
//   node .mockups/build-funnel.mjs
import sharp from "sharp";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const FAM = {
  serif: "Georgia,'DejaVu Serif','Liberation Serif',serif",
  sans: "Helvetica,Arial,'Liberation Sans','DejaVu Sans',sans-serif",
  mono: "'SF Mono','DejaVu Sans Mono','Liberation Mono',monospace",
};
const t = (x, y, s, o = {}) => {
  const { size = 14, w = 400, fill = "#000", fam = "sans", anchor = "start", track = 0, op = 1 } = o;
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${w}" fill="${fill}" font-family="${FAM[fam]}" text-anchor="${anchor}"${track ? ` letter-spacing="${track}"` : ""}${op < 1 ? ` opacity="${op}"` : ""}>${esc(s)}</text>`;
};
const r = (x, y, w, h, o = {}) => {
  const { rad = 0, fill = "none", stroke = "none", sw = 0, op = 1, dash = "" } = o;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rad}" ry="${rad}" fill="${fill}"${stroke !== "none" ? ` stroke="${stroke}" stroke-width="${sw}"` : ""}${dash ? ` stroke-dasharray="${dash}"` : ""}${op < 1 ? ` opacity="${op}"` : ""}/>`;
};
const cir = (cx, cy, rad, o = {}) => {
  const { fill = "none", stroke = "none", sw = 0, op = 1 } = o;
  return `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="${fill}"${stroke !== "none" ? ` stroke="${stroke}" stroke-width="${sw}"` : ""}${op < 1 ? ` opacity="${op}"` : ""}/>`;
};
const ln = (x1, y1, x2, y2, o = {}) => {
  const { stroke = "#000", sw = 1, op = 1 } = o;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}"${op < 1 ? ` opacity="${op}"` : ""}/>`;
};
const path = (d, o = {}) => {
  const { fill = "none", stroke = "none", sw = 0 } = o;
  return `<path d="${d}" fill="${fill}"${stroke !== "none" ? ` stroke="${stroke}" stroke-width="${sw}"` : ""}/>`;
};
const G = (x, y, inner) => `<g transform="translate(${x},${y})">${inner}</g>`;

// Field-guide theme (warm paper — the most readable of the three looks).
const TH = {
  canvasBg: "#E7DECB", headerInk: "#2A2318", headerSub: "#8A7B62",
  frame: "#CDBFA4", screenBg: "#F6F0E3", ink: "#241F18", inkSoft: "#837762", hair: "#E2D8C4",
  brand: "#A8462C", tileBg: "#FBF7EE", chipBg: "#ECE2D0",
};

function statusBar() {
  let s = t(22, 30, "9:41", { size: 15, w: 700, fill: TH.ink, fam: "sans" });
  for (let i = 0; i < 4; i++) s += r(300 + i * 6, 26 - i * 2, 4, 8 + i * 2, { rad: 1, fill: TH.ink });
  s += r(330, 22, 22, 11, { rad: 3, stroke: TH.ink, sw: 1.3 }) + r(332, 24.5, 15, 6, { rad: 1.5, fill: TH.ink });
  return s;
}
function device(inner) {
  return r(-7, -7, 394, 814, { rad: 42, fill: TH.frame }) +
    r(0, 0, 380, 800, { rad: 35, fill: TH.screenBg }) +
    r(132, 11, 116, 25, { rad: 12.5, fill: TH.frame }) + inner;
}
function backRow(label) {
  return path("M30 64 l-8 7 l8 7", { stroke: TH.inkSoft, sw: 2 }) +
    t(44, 76, label, { size: 13, w: 600, fill: TH.inkSoft, fam: "sans" });
}
function eyebrow(s, y, color) { return t(22, y, s, { size: 11, w: 700, fill: color || TH.inkSoft, fam: "mono", track: 2 }); }

// pill (auto-applied context filter — shows the phone pre-filtered)
function ctxPill(x, y, label, on = true) {
  const wpx = label.length * 7.2 + 40;
  let s = r(x, y, wpx, 30, { rad: 15, fill: on ? "color-mix(in srgb, #2E6B3A 14%, transparent)" : TH.chipBg, stroke: on ? "#2E6B3A" : TH.hair, sw: on ? 1.2 : 1 });
  if (on) { s += path(`M${x + 14} ${y + 15} l4 4 l7 -8`, { stroke: "#2E6B3A", sw: 2 }); }
  s += t(x + (on ? 28 : 14), y + 19.5, label, { size: 12.5, w: 600, fill: on ? "#2E6B3A" : TH.inkSoft, fam: "sans" });
  return s + (on ? "" : "");
}

// ── Screen 1: the ask ───────────────────────────────────────────────
function screenAsk() {
  let s = statusBar();
  s += eyebrow("DOWNTOWN FREDERICK · 6:12 PM · 72°", 72);
  s += t(22, 112, "What are you", { size: 30, w: 700, fill: TH.ink, fam: "serif" });
  s += t(22, 146, "after?", { size: 30, w: 700, fill: TH.ink, fam: "serif" });
  // express lane: "or just ask"
  s += r(22, 166, 336, 44, { rad: 22, fill: TH.tileBg, stroke: TH.hair, sw: 1 });
  s += cir(44, 188, 7, { stroke: TH.inkSoft, sw: 2 }) + ln(49, 193, 54, 198, { stroke: TH.inkSoft, sw: 2 });
  s += t(66, 193, "or just ask — “pizza”, “parking”, “trash day”", { size: 13, w: 400, fill: TH.inkSoft, fam: "sans" });
  // intent tiles 2x4
  const intents = [
    ["Eat", "pizza · tacos · sit-down", "#A8462C", true],
    ["Drinks", "breweries · bars · wine", "#7E1F1F", false],
    ["Coffee", "cafes & bakeries", "#8B5A2B", false],
    ["Outside", "parks · trails · creek", "#2E6B3A", false],
    ["Tonight", "live music & events", "#7E2C6F", false],
    ["Shop", "Market St & antiques", "#C2691F", false],
    ["History", "museums & sites", "#2F5470", false],
    ["Get around", "parking · MARC · civic", "#4A6670", false],
  ];
  const gx = [22, 198], gw = 160, gh = 92;
  intents.forEach((it, i) => {
    const x = gx[i % 2], y = 230 + Math.floor(i / 2) * (gh + 12);
    const [label, sub, col, hi] = it;
    s += r(x, y, gw, gh, { rad: 18, fill: hi ? "color-mix(in srgb, #A8462C 9%, var(--paper, #FBF7EE))" : TH.tileBg, stroke: hi ? col : TH.hair, sw: hi ? 1.6 : 1 });
    s += cir(x + 22, y + 26, 5, { fill: col });
    s += t(x + 16, y + 56, label, { size: 19, w: 700, fill: TH.ink, fam: "serif" });
    s += t(x + 16, y + 76, sub, { size: 11, w: 400, fill: TH.inkSoft, fam: "sans" });
    if (hi) s += path(`M${x + gw - 26} ${y + 50} l7 6 l-7 6`, { stroke: col, sw: 2.5 });
  });
  // secondary: not sure -> today/briefing becomes an answer, not the door
  s += t(190, 770, "Not sure? See what's good today →", { size: 13, w: 600, fill: TH.brand, fam: "sans", anchor: "middle" });
  return s;
}

// ── Screen 2: narrow (context auto-applied) ─────────────────────────
function screenNarrow() {
  let s = statusBar();
  s += backRow("What are you after?");
  s += eyebrow("EAT", 112, "#A8462C");
  s += t(22, 146, "What kind?", { size: 28, w: 700, fill: TH.ink, fam: "serif" });
  // the KEY idea: context already applied, shown as on-pills
  s += t(22, 178, "Already narrowed for you:", { size: 12, w: 600, fill: TH.inkSoft, fam: "sans" });
  s += ctxPill(22, 190, "Open now", true);
  s += ctxPill(140, 190, "10-min walk", true);
  // sub tiles
  const subs = [
    ["Pizza", "#A8462C", true], ["Sit-down", "#A8462C", false],
    ["Breweries", "#C99632", false], ["Bakeries", "#8B5A2B", false],
    ["Bars", "#7E1F1F", false], ["Food trucks", "#2E6B3A", false],
  ];
  const gx = [22, 198], gw = 160, gh = 96;
  subs.forEach((it, i) => {
    const x = gx[i % 2], y = 244 + Math.floor(i / 2) * (gh + 12);
    const [label, col, hi] = it;
    s += r(x, y, gw, gh, { rad: 18, fill: hi ? "color-mix(in srgb, #A8462C 10%, #FBF7EE)" : TH.tileBg, stroke: hi ? col : TH.hair, sw: hi ? 1.8 : 1 });
    s += cir(x + 22, y + 28, 5, { fill: col });
    s += t(x + 16, y + 60, label, { size: 20, w: 700, fill: TH.ink, fam: "serif" });
    if (hi) {
      s += t(x + 16, y + 80, "3 open near you", { size: 11.5, w: 600, fill: col, fam: "sans" });
      s += path(`M${x + gw - 26} ${y + 52} l7 6 l-7 6`, { stroke: col, sw: 2.5 });
    }
  });
  s += t(190, 770, "Change the filters ▾", { size: 12.5, w: 600, fill: TH.inkSoft, fam: "sans", anchor: "middle" });
  return s;
}

// ── Screen 3: the answer ────────────────────────────────────────────
function answerCard(y, { name, meta, source, closest }) {
  let s = r(22, y, 336, 124, { rad: 18, fill: TH.tileBg, stroke: TH.hair, sw: 1 });
  // status chip
  s += r(38, y + 16, 78, 22, { rad: 11, fill: "color-mix(in srgb, #2E6B3A 14%, transparent)" });
  s += t(50, y + 31, "OPEN NOW", { size: 10, w: 700, fill: "#2E6B3A", fam: "mono", track: 0.5 });
  if (closest) {
    s += r(122, y + 16, 64, 22, { rad: 11, fill: "color-mix(in srgb, #A8462C 13%, transparent)" });
    s += t(132, y + 31, "CLOSEST", { size: 10, w: 700, fill: "#A8462C", fam: "mono", track: 0.5 });
  }
  s += t(38, y + 62, name, { size: 20, w: 700, fill: TH.ink, fam: "serif" });
  s += t(38, y + 82, meta, { size: 13, w: 400, fill: TH.inkSoft, fam: "sans" });
  s += t(38, y + 100, source, { size: 10.5, w: 600, fill: TH.inkSoft, fam: "mono", track: 0.3 });
  // actions
  s += r(214, y + 86, 64, 26, { rad: 13, fill: TH.brand });
  s += t(246, y + 103, "Directions", { size: 11, w: 700, fill: "#fff", fam: "sans", anchor: "middle" });
  s += r(286, y + 86, 56, 26, { rad: 13, fill: "none", stroke: TH.hair, sw: 1.2 });
  s += t(314, y + 103, "Menu", { size: 11, w: 700, fill: TH.ink, fam: "sans", anchor: "middle" });
  return s;
}
function screenAnswer() {
  let s = statusBar();
  s += backRow("Eat · Pizza");
  s += eyebrow("EAT · PIZZA · OPEN NOW", 112, "#A8462C");
  s += t(22, 146, "Pizza, open now", { size: 27, w: 700, fill: TH.ink, fam: "serif" });
  s += t(22, 172, "3 within a 10-minute walk, closest first.", { size: 13.5, w: 400, fill: TH.inkSoft, fam: "sans" });
  s += answerCard(192, { name: "Pizzeria Roma", meta: "Open till 10 · 0.3 mi · 6-min walk", source: "HOURS VERIFIED TODAY · GOOGLE", closest: true });
  s += answerCard(328, { name: "Il Forno Pizzeria", meta: "Open till 11 · 0.4 mi · 8-min walk", source: "HOURS VERIFIED TODAY · GOOGLE", closest: false });
  s += answerCard(464, { name: "Fratelli's Pizza", meta: "Open till 9 · 0.6 mi · 11-min walk", source: "HOURS VERIFIED · 3 DAYS AGO", closest: false });
  s += t(190, 624, "See all 9 pizza places →", { size: 13, w: 600, fill: TH.brand, fam: "sans", anchor: "middle" });
  return s;
}

// ── compose: 3 phones in a row ──────────────────────────────────────
const SCALE = 2;
const M = 56, GAP = 56, HEAD = 150;
const W = M + 380 * 3 + GAP * 2 + M;
const H = 60 + HEAD + 32 + 800 + 56;
let body = r(0, 0, W, H, { fill: TH.canvasBg });
body += t(M, 92, "FREDERICK RADIUS", { size: 13, w: 700, fill: TH.headerSub, fam: "mono", track: 4 });
body += t(M, 136, "The funnel", { size: 44, w: 700, fill: TH.headerInk, fam: "serif" });
body += t(M, 168, "open → ask what you're after → narrow (the phone pre-filters) → the answer. The pizza run, in 3 taps.", { size: 16, w: 400, fill: TH.headerSub, fam: "sans" });
body += ln(M, 190, W - M, 190, { stroke: TH.headerSub, sw: 1, op: 0.4 });
const labels = ["1 · ASK", "2 · NARROW", "3 · ANSWER"];
const screens = [screenAsk(), screenNarrow(), screenAnswer()];
for (let i = 0; i < 3; i++) {
  const x = M + i * (380 + GAP), y0 = 60 + HEAD;
  body += t(x + 6, y0 + 20, labels[i], { size: 13, w: 700, fill: TH.headerSub, fam: "mono", track: 2 });
  // arrow between phones
  if (i < 2) body += path(`M${x + 380 + 16} ${y0 + 420} l16 0 m-7 -7 l7 7 l-7 7`, { stroke: TH.brand, sw: 3 });
  body += G(x, y0 + 32, device(screens[i]));
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * SCALE}" height="${H * SCALE}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
await sharp(Buffer.from(svg)).png().toFile(".mockups/funnel-pizza.png");
console.log("rendered .mockups/funnel-pizza.png", W + "x" + H);
