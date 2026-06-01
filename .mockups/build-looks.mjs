// Frederick Radius — look exploration generator.
// Emits 3 PNG comps (Field Guide / Instrument / Almanac Dark), each
// showing the 4 primary tabs (Today, Map, Events, My Radius) at phone
// size, with real Frederick content + the data-confidence chips.
// No browser needed: SVG -> PNG via sharp (librsvg).
//
//   node .mockups/build-looks.mjs
import sharp from "sharp";

// ── tiny SVG helpers ────────────────────────────────────────────────
const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
  const { rad = 0, fill = "none", stroke = "none", sw = 0, op = 1 } = o;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rad}" ry="${rad}" fill="${fill}"${stroke !== "none" ? ` stroke="${stroke}" stroke-width="${sw}"` : ""}${op < 1 ? ` opacity="${op}"` : ""}/>`;
};
const ln = (x1, y1, x2, y2, o = {}) => {
  const { stroke = "#000", sw = 1, op = 1, dash = "" } = o;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}"${op < 1 ? ` opacity="${op}"` : ""}${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
};
const cir = (cx, cy, rad, o = {}) => {
  const { fill = "none", stroke = "none", sw = 0, op = 1 } = o;
  return `<circle cx="${cx}" cy="${cy}" r="${rad}" fill="${fill}"${stroke !== "none" ? ` stroke="${stroke}" stroke-width="${sw}"` : ""}${op < 1 ? ` opacity="${op}"` : ""}/>`;
};
const path = (d, o = {}) => {
  const { fill = "none", stroke = "none", sw = 0, op = 1 } = o;
  return `<path d="${d}" fill="${fill}"${stroke !== "none" ? ` stroke="${stroke}" stroke-width="${sw}"` : ""}${op < 1 ? ` opacity="${op}"` : ""}/>`;
};
const G = (x, y, inner) => `<g transform="translate(${x},${y})">${inner}</g>`;
const onColor = (hex) => {
  const n = hex.replace("#", "");
  const R = parseInt(n.slice(0, 2), 16), Gr = parseInt(n.slice(2, 4), 16), B = parseInt(n.slice(4, 6), 16);
  return (0.299 * R + 0.587 * Gr + 0.114 * B) / 255 > 0.6 ? "#16140F" : "#FFFFFF";
};

// ── shared chrome ───────────────────────────────────────────────────
function statusBar(th) {
  let s = t(22, 30, "9:41", { size: 15, w: 700, fill: th.ink, fam: "sans" });
  // signal bars
  for (let i = 0; i < 4; i++) s += r(300 + i * 6, 26 - i * 2, 4, 8 + i * 2, { rad: 1, fill: th.ink });
  // battery
  s += r(330, 22, 22, 11, { rad: 3, fill: "none", stroke: th.ink, sw: 1.3 });
  s += r(332, 24.5, 15, 6, { rad: 1.5, fill: th.ink });
  return s;
}
function pill(th, text, xRight, yTop, o = {}) {
  const size = 9.5, padX = 9, h = 19;
  const w = Math.round(text.length * size * 0.62) + padX * 2;
  const x = xRight - w;
  const fill = o.fill || th.chipBg, ink = o.ink || th.chipInk;
  let s = r(x, yTop, w, h, { rad: 9.5, fill, stroke: o.stroke || "none", sw: o.sw || 0 });
  if (o.dot) s += cir(x + padX + 3, yTop + h / 2, 2.5, { fill: o.dot });
  s += t(x + padX + (o.dot ? 9 : 0), yTop + 13, text, { size, w: 700, fill: ink, fam: "mono", track: 0.4 });
  return s;
}
function navIcon(kind, cx, cy, col, on) {
  const sw = on ? 2.2 : 1.8;
  if (kind === "today")
    return cir(cx, cy, 5.5, { fill: on ? col : "none", stroke: col, sw }) +
      [0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
        const rad = (a * Math.PI) / 180;
        return ln(cx + Math.cos(rad) * 9, cy + Math.sin(rad) * 9, cx + Math.cos(rad) * 12, cy + Math.sin(rad) * 12, { stroke: col, sw });
      }).join("");
  if (kind === "map")
    return path(`M${cx} ${cy - 11} C ${cx + 8} ${cy - 11} ${cx + 8} ${cy - 1} ${cx} ${cy + 9} C ${cx - 8} ${cy - 1} ${cx - 8} ${cy - 11} ${cx} ${cy - 11} Z`, { fill: on ? col : "none", stroke: col, sw }) + cir(cx, cy - 5, 2.6, { fill: on ? "#fff" : col });
  if (kind === "events")
    return r(cx - 10, cy - 9, 20, 19, { rad: 3, fill: "none", stroke: col, sw }) +
      ln(cx - 10, cy - 3, cx + 10, cy - 3, { stroke: col, sw }) +
      ln(cx - 5, cy - 12, cx - 5, cy - 6, { stroke: col, sw }) + ln(cx + 5, cy - 12, cx + 5, cy - 6, { stroke: col, sw }) +
      (on ? cir(cx, cy + 4, 2, { fill: col }) : "");
  // radius rings
  return cir(cx, cy, 11, { stroke: col, sw: sw - 0.4, op: 0.55 }) + cir(cx, cy, 6.5, { stroke: col, sw }) + cir(cx, cy, 2.4, { fill: col });
}
function nav(th, active) {
  const tabs = [["Today", "today"], ["Map", "map"], ["Events", "events"], ["My Radius", "radius"]];
  let s = r(0, 726, 380, 74, { fill: th.navBg }) + ln(0, 726, 380, 726, { stroke: th.hair, sw: 1 });
  tabs.forEach((tb, i) => {
    const cx = 47.5 + i * 95, on = tb[1] === active, col = on ? th.navActive : th.inkSoft;
    s += navIcon(tb[1], cx, 754, col, on);
    s += t(cx, 784, tb[0], { size: 10.5, w: on ? 700 : 400, fill: col, fam: "sans", anchor: "middle" });
  });
  return s;
}
function device(th, inner) {
  return r(-7, -7, 394, 814, { rad: 42, fill: th.frame }) +
    r(0, 0, 380, 800, { rad: 35, fill: th.screenBg }) +
    r(132, 11, 116, 25, { rad: 12.5, fill: th.frame }) +
    inner;
}

// ── screens (return inner svg for a 380x800 screen) ─────────────────
function eyebrow(th, s, y) { return t(22, y, s, { size: 10.5, w: 700, fill: th.inkSoft, fam: "mono", track: 2 }); }

function screenToday(th) {
  let s = statusBar(th);
  s += eyebrow(th, "EVENING · FREDERICK, MD", 70);
  s += t(22, 110, "Good evening.", { size: 30, w: 700, fill: th.ink, fam: th.dispFam });
  s += t(22, 140, "Patio weather till 9.", { size: 21, w: 400, fill: th.brand, fam: th.dispFam });
  // hero answer
  if (th.key === "B") {
    s += r(22, 160, 336, 120, { rad: th.rMd, fill: th.brand });
    s += t(38, 268, "7", { size: 112, w: 700, fill: "#fff", fam: th.numFam });
    s += t(196, 214, "PLACES", { size: 15, w: 700, fill: "#fff", fam: "mono", track: 2 });
    s += t(196, 238, "OPEN NOW", { size: 15, w: 700, fill: "#fff", fam: "mono", track: 2 });
    s += t(196, 262, "within 1 mile", { size: 13, w: 400, fill: "#fff", fam: "sans", op: 0.9 });
    s += pill(th, "GOOGLE · VERIFIED", 344, 254, { fill: "#ffffff", ink: th.brand });
  } else {
    const heroFill = th.key === "C" ? th.cat.civic : th.tint.neutral;
    const heroInk = th.key === "C" ? onColor(heroFill) : th.ink;
    s += r(22, 160, 336, 120, { rad: th.rLg, fill: heroFill, stroke: th.key === "C" ? "none" : th.hair, sw: 1 });
    s += t(38, 256, "7", { size: 96, w: 700, fill: th.key === "C" ? onColor(heroFill) : th.brand, fam: th.numFam });
    s += t(166, 212, "places open", { size: 20, w: 700, fill: heroInk, fam: th.dispFam });
    s += t(166, 236, "near you", { size: 20, w: 700, fill: heroInk, fam: th.dispFam });
    s += t(166, 262, "within 1 mile · now", { size: 12.5, w: 400, fill: th.key === "C" ? heroInk : th.inkSoft, fam: "mono", op: 0.85 });
    s += pill(th, "GOOGLE · VERIFIED", 344, 252, { fill: th.key === "C" ? "rgba(0,0,0,0.18)" : th.chipBg, ink: heroInk });
  }
  // 3 answer cards
  const cards = [
    { label: "OPEN NOW", title: "Idiom Brewing", sub: "Open till 11 · 0.3 mi", accent: th.cat.brew, status: "Hours verified" },
    { label: "STARTING SOON", title: "Sky Stage", sub: "Live jazz · 7:30 · 0.5 mi", accent: th.cat.arts, status: "Tickets" },
    { label: "WEEKEND BET", title: "First Saturday", sub: "Downtown · Sat 5–9pm", accent: th.cat.event, status: "DFP" },
  ];
  let y = 298;
  for (const c of cards) {
    s += answerCard(th, y, c);
    y += 88;
  }
  // civic moat strip
  s += r(22, 562, 336, 52, { rad: th.rMd, fill: th.tint.brand, stroke: th.key === "C" ? "none" : th.hair, sw: 1 });
  s += cir(44, 588, 4, { fill: th.brand });
  s += t(58, 584, "Recycling", { size: 12, w: 700, fill: th.inkSoft, fam: "mono", track: 1 });
  s += t(58, 605, "Thursday", { size: 19, w: 700, fill: th.ink, fam: th.dispFam });
  s += pill(th, "COUNTY · TODAY", 344, 578, { dot: th.cat.brew });
  // weather context strip
  s += t(22, 654, "72°", { size: 22, w: 700, fill: th.ink, fam: th.numFam });
  s += t(64, 654, "now · 58° low · sunset 8:34", { size: 13, w: 400, fill: th.inkSoft, fam: "sans" });
  s += pill(th, "NWS · 10 MIN", 344, 642, {});
  s += nav(th, "today");
  return s;
}

function answerCard(th, y, c) {
  let s = "";
  if (th.key === "B") {
    // Braun color-block row
    const fill = c.accent, ink = onColor(fill);
    s += r(22, y, 336, 78, { rad: th.rSm, fill });
    s += t(38, y + 26, c.label, { size: 10.5, w: 700, fill: ink, fam: "mono", track: 1.5, op: 0.85 });
    s += t(38, y + 52, c.title, { size: 22, w: 700, fill: ink, fam: th.dispFam });
    s += t(38, y + 70, c.sub, { size: 12, w: 400, fill: ink, fam: "sans", op: 0.85 });
    s += t(344, y + 50, c.status === "Tickets" ? "7:30" : c.status === "DFP" ? "SAT" : "11", { size: 30, w: 700, fill: ink, fam: th.numFam, anchor: "end" });
    return s;
  }
  const dark = th.key === "C";
  const bg = dark ? th.tileBg : th.tint[c.label === "OPEN NOW" ? "brew" : c.label === "STARTING SOON" ? "arts" : "event"];
  s += r(22, y, 336, 78, { rad: th.rMd, fill: bg, stroke: dark ? "none" : th.hair, sw: 1 });
  s += r(22, y, 5, 78, { fill: c.accent });
  s += t(40, y + 24, c.label, { size: 9.5, w: 700, fill: c.accent, fam: "mono", track: 1.5 });
  s += t(40, y + 48, c.title, { size: 19, w: 700, fill: th.ink, fam: th.dispFam });
  s += t(40, y + 67, c.sub, { size: 13, w: 400, fill: th.inkSoft, fam: "sans" });
  s += pill(th, c.status, 344, y + 14, { dot: c.accent });
  s += cir(344, y + 56, 13, { fill: dark ? "rgba(255,255,255,0.06)" : "#ffffff", stroke: th.hair, sw: 1 });
  s += path(`M${340} ${y + 56} l4 4 l5 -7`, { stroke: c.accent, sw: 2 });
  return s;
}

function screenMap(th) {
  let s = statusBar(th);
  s += eyebrow(th, "MAP · WITHIN REACH", 70);
  s += t(22, 102, "On foot from here", { size: 24, w: 700, fill: th.ink, fam: th.dispFam });
  // map canvas
  const mapBg = th.key === "C" ? "#1B2026" : th.key === "B" ? "#E3E0D6" : "#ECE6D5";
  s += r(22, 118, 336, 360, { rad: th.rMd, fill: mapBg });
  // street grid
  for (let i = 1; i < 5; i++) s += ln(22, 118 + i * 72, 358, 118 + i * 72, { stroke: th.ink, sw: 1, op: 0.06 });
  for (let i = 1; i < 5; i++) s += ln(22 + i * 67, 118, 22 + i * 67, 478, { stroke: th.ink, sw: 1, op: 0.06 });
  // park blob + creek
  s += `<ellipse cx="92" cy="180" rx="58" ry="40" fill="${th.cat.park}" opacity="0.30"/>`;
  s += t(70, 184, "Baker Park", { size: 10, w: 700, fill: th.cat.park, fam: "mono" });
  s += path("M40 470 C 140 430, 200 410, 350 360", { stroke: th.cat.civic, sw: 4, op: 0.5 });
  s += t(250, 392, "Carroll Creek", { size: 9.5, w: 700, fill: th.cat.civic, fam: "mono", op: 0.9 });
  // radius rings at center (the instrument)
  const mx = 200, my = 300;
  s += cir(mx, my, 92, { stroke: th.brand, sw: 1.3, op: 0.28 });
  s += cir(mx, my, 60, { stroke: th.brand, sw: 1.3, op: 0.45 });
  s += cir(mx, my, 30, { stroke: th.brand, sw: 1.6, op: 0.7 });
  s += cir(mx, my, 8, { fill: th.brand });
  s += cir(mx, my, 8, { stroke: "#fff", sw: 2, op: 0.8 });
  // pins
  const pins = [[120, 250, th.cat.brew], [285, 230, th.cat.arts], [250, 330, th.cat.event], [150, 360, th.cat.food], [300, 300, th.cat.civic]];
  for (const [px, py, col] of pins) { s += cir(px, py, 8, { fill: col, stroke: "#fff", sw: 2 }); }
  s += pill(th, "ISOCHRONE · 15-MIN WALK", 344, 132, { fill: th.key === "C" ? "rgba(0,0,0,0.35)" : "#ffffffcc" });
  // intent chips bar
  const chips = ["Eat", "Coffee", "Outside", "Drinks"];
  let cx = 22;
  chips.forEach((c, i) => {
    const w = c.length * 8 + 26;
    s += r(cx, 492, w, 26, { rad: 13, fill: i === 0 ? th.brand : th.chipBg });
    s += t(cx + w / 2, 509, c, { size: 12.5, w: 700, fill: i === 0 ? onColor(th.brand) : th.chipInk, fam: "sans", anchor: "middle" });
    cx += w + 8;
  });
  // within-reach outcomes
  const rows = [["4", "Coffee", "Frederick Coffee Co.", th.cat.food], ["6", "Brewery", "Idiom Brewing", th.cat.brew], ["8", "Park", "Baker Park", th.cat.park]];
  let y = 540;
  for (const [min, kind, place, col] of rows) {
    s += t(28, y + 8, min, { size: 34, w: 700, fill: th.ink, fam: th.numFam });
    s += t(76, y - 4, "MIN", { size: 9.5, w: 700, fill: th.inkSoft, fam: "mono", track: 1 });
    s += t(76, y + 12, kind, { size: 16, w: 700, fill: th.ink, fam: th.dispFam });
    s += t(150, y + 12, "· " + place, { size: 13, w: 400, fill: th.inkSoft, fam: "sans" });
    s += cir(344, y + 2, 5, { fill: col });
    if (y < 620) s += ln(22, y + 26, 358, y + 26, { stroke: th.hair, sw: 1 });
    y += 46;
  }
  s += nav(th, "map");
  return s;
}

function screenEvents(th) {
  let s = statusBar(th);
  s += eyebrow(th, "EVENTS", 70);
  // lens chips
  const lenses = ["Tonight", "Weekend", "Free", "Family"];
  let cx = 22;
  lenses.forEach((c, i) => {
    const w = c.length * 8 + 24;
    s += r(cx, 84, w, 28, { rad: 14, fill: i === 1 ? th.brand : th.chipBg });
    s += t(cx + w / 2, 102, c, { size: 12.5, w: 700, fill: i === 1 ? onColor(th.brand) : th.chipInk, fam: "sans", anchor: "middle" });
    cx += w + 8;
  });
  // big date hero
  s += t(22, 150, "SAT", { size: 20, w: 700, fill: th.inkSoft, fam: "mono", track: 3 });
  s += t(20, 224, "7", { size: 96, w: 700, fill: th.brand, fam: th.numFam });
  s += t(96, 196, "JUN", { size: 40, w: 700, fill: th.ink, fam: th.dispFam });
  s += t(98, 222, "2026", { size: 15, w: 400, fill: th.inkSoft, fam: "mono", track: 1 });
  // featured event card
  const fbg = th.key === "C" ? th.tileBg : th.tint.event;
  s += r(22, 244, 336, 96, { rad: th.rMd, fill: fbg, stroke: th.key === "C" ? "none" : th.hair, sw: 1 });
  s += r(22, 244, 96, 96, { rad: th.rMd, fill: th.cat.event, op: 0.9 });
  s += t(56, 296, "1st", { size: 26, w: 700, fill: onColor(th.cat.event), fam: th.numFam, anchor: "middle" });
  s += t(70, 273, "FEATURED", { size: 9.5, w: 700, fill: th.cat.event, fam: "mono", track: 1.5 });
  s += t(132, 298, "First Saturday", { size: 21, w: 700, fill: th.ink, fam: th.dispFam });
  s += t(132, 320, "Downtown · 5–9pm · free", { size: 13, w: 400, fill: th.inkSoft, fam: "sans" });
  s += pill(th, "DFP · VERIFIED", 344, 254, { dot: th.cat.event });
  // time-first rows
  const rows = [["7:30", "Sky Stage", "Live jazz on the plaza", th.cat.arts], ["8:00", "Weinberg Center", "The Nutcracker", th.cat.arts], ["7:00", "Brewer's Alley", "Trivia night", th.cat.brew]];
  let y = 366;
  for (const [time, venue, sub, col] of rows) {
    s += t(22, y + 24, time, { size: 28, w: 700, fill: th.ink, fam: th.numFam });
    s += ln(108, y - 4, 108, y + 34, { stroke: col, sw: 3 });
    s += t(122, y + 12, venue, { size: 17, w: 700, fill: th.ink, fam: th.dispFam });
    s += t(122, y + 31, sub, { size: 13, w: 400, fill: th.inkSoft, fam: "sans" });
    s += cir(344, y + 6, 5, { fill: col });
    y += 56;
  }
  // civic separated
  s += ln(22, y + 2, 358, y + 2, { stroke: th.hair, sw: 1 });
  s += t(22, y + 26, "Official calendars (civic)", { size: 13, w: 400, fill: th.inkSoft, fam: "sans" });
  s += t(344, y + 26, "12 ›", { size: 13, w: 700, fill: th.inkSoft, fam: "sans", anchor: "end" });
  s += nav(th, "events");
  return s;
}

function screenRadius(th) {
  let s = statusBar(th);
  s += eyebrow(th, "MY RADIUS · WITHIN 5 MI OF DOWNTOWN", 70);
  s += t(22, 108, "Your places", { size: 26, w: 700, fill: th.ink, fam: th.dispFam });
  s += t(22, 134, "12 saved", { size: 15, w: 700, fill: th.brand, fam: "mono" });
  s += t(96, 134, "· 3 towns · 2 follows", { size: 13, w: 400, fill: th.inkSoft, fam: "sans" });
  // saved 2x2
  const saved = [
    { name: "Brewer's Alley", cat: "Food", col: th.cat.food, status: "Open till 12", ok: true },
    { name: "Baker Park", cat: "Park", col: th.cat.park, status: "Open · dawn–dusk", ok: true },
    { name: "The Banyan", cat: "Live music", col: th.cat.arts, status: "Hours not confirmed", ok: false },
    { name: "Idiom Brewing", cat: "Brewery", col: th.cat.brew, status: "Open till 11", ok: true },
  ];
  const gx = [22, 196], gy = [150, 278];
  saved.forEach((p, i) => {
    const x = gx[i % 2], y = gy[Math.floor(i / 2)];
    const bg = th.key === "C" ? th.tileBg : th.tint.neutral;
    s += r(x, y, 162, 116, { rad: th.rMd, fill: bg, stroke: th.key === "C" ? "none" : th.hair, sw: 1 });
    s += r(x, y, 162, 6, { rad: 0, fill: p.col });
    s += t(x + 16, y + 34, p.cat.toUpperCase(), { size: 9, w: 700, fill: p.col, fam: "mono", track: 1.2 });
    s += t(x + 16, y + 60, p.name, { size: 16, w: 700, fill: th.ink, fam: th.dispFam });
    s += cir(x + 18, y + 88, 3.5, { fill: p.ok ? th.cat.brew : "#C99632" });
    s += t(x + 28, y + 92, p.status, { size: 11, w: p.ok ? 400 : 700, fill: p.ok ? th.inkSoft : "#9A6B12", fam: "sans" });
  });
  // recently viewed
  s += t(22, 432, "RECENTLY VIEWED", { size: 10, w: 700, fill: th.inkSoft, fam: "mono", track: 1.5 });
  const recents = ["Sky Stage", "Carroll Creek", "Weinberg"];
  let cx = 22;
  recents.forEach((c) => {
    const w = c.length * 7.2 + 26;
    s += r(cx, 444, w, 28, { rad: 14, fill: th.chipBg });
    s += t(cx + 13, 462, c, { size: 12.5, w: 400, fill: th.chipInk, fam: "sans" });
    cx += w + 8;
  });
  // following + notify loop
  s += t(22, 506, "FOLLOWING", { size: 10, w: 700, fill: th.inkSoft, fam: "mono", track: 1.5 });
  const follows = [["Downtown Frederick", 524], ["Brunswick", 568]];
  for (const [name, y] of follows) {
    s += r(22, y, 336, 36, { rad: th.rSm, fill: th.key === "C" ? th.tileBg : th.tint.neutral, stroke: th.key === "C" ? "none" : th.hair, sw: 1 });
    s += cir(44, y + 18, 4, { fill: th.brand });
    s += t(60, y + 23, name, { size: 14, w: 700, fill: th.ink, fam: "sans" });
    s += t(344, y + 23, "following", { size: 11, w: 400, fill: th.inkSoft, fam: "mono", anchor: "end" });
  }
  // notify toggle
  s += r(22, 616, 336, 52, { rad: th.rMd, fill: th.brand });
  const bink = onColor(th.brand);
  s += t(40, 638, "Notify me", { size: 11, w: 700, fill: bink, fam: "mono", track: 1, op: 0.85 });
  s += t(40, 658, "Live music downtown", { size: 16, w: 700, fill: bink, fam: th.dispFam });
  s += r(300, 630, 44, 24, { rad: 12, fill: "rgba(255,255,255,0.35)" });
  s += cir(332, 642, 9, { fill: "#fff" });
  s += nav(th, "radius");
  return s;
}

// ── themes ──────────────────────────────────────────────────────────
const THEMES = [
  {
    key: "A", name: "FIELD GUIDE", tagline: "Warm paper · editorial serif · the almanac voice",
    ref: "happn 'Sam' + the editorial calendar — the field-guide register",
    canvasBg: "#E7DECB", headerInk: "#2A2318", headerSub: "#8A7B62",
    frame: "#CDBFA4", screenBg: "#F6F0E3", ink: "#241F18", inkSoft: "#837762", hair: "#E2D8C4",
    brand: "#A8462C", navBg: "#F6F0E3", navActive: "#A8462C",
    cat: { brew: "#2E6B3A", arts: "#7E2C6F", event: "#C2691F", civic: "#2F5470", park: "#2E6B3A", food: "#A8462C" },
    tint: { brew: "#E7EFE3", arts: "#F1E7EF", event: "#F7ECDA", neutral: "#FBF7EE", brand: "#F4E5DE" },
    tileBg: "#FBF7EE", chipBg: "#ECE2D0", chipInk: "#6F6450",
    dispFam: "serif", numFam: "serif", rLg: 22, rMd: 16, rSm: 9,
  },
  {
    key: "B", name: "INSTRUMENT", tagline: "Swiss / Braun · huge numerals · one signal accent",
    ref: "Braun 'You Shop Data Insights' + the numbered key — the instrument register",
    canvasBg: "#DAD6CC", headerInk: "#16140F", headerSub: "#6E6A60",
    frame: "#C3BDAF", screenBg: "#ECE9E1", ink: "#16140F", inkSoft: "#6E6A60", hair: "#CDC7B9",
    brand: "#E5481F", navBg: "#ECE9E1", navActive: "#16140F",
    cat: { brew: "#6F7D4A", arts: "#E8B100", event: "#5B6770", civic: "#2B2B2B", park: "#6F7D4A", food: "#E5481F" },
    tint: { brew: "#E3E4D5", arts: "#F2EBD2", event: "#E2E4E5", neutral: "#F4F2EA", brand: "#F6E0D8" },
    tileBg: "#F4F2EA", chipBg: "#E0DCCF", chipInk: "#46443C",
    dispFam: "sans", numFam: "sans", rLg: 8, rMd: 6, rSm: 4,
  },
  {
    key: "C", name: "ALMANAC DARK", tagline: "Dark bento · saturated tiles · gauges + digits",
    ref: "the weather-widget grid + BBBANK bento — the night / utility register",
    canvasBg: "#0E1012", headerInk: "#F1EDE4", headerSub: "#8A9097",
    frame: "#2A2E34", screenBg: "#15181C", ink: "#F1EDE4", inkSoft: "#969CA4", hair: "#2A2F36",
    brand: "#E5602F", navBg: "#15181C", navActive: "#2E83C9",
    cat: { brew: "#3FA66A", arts: "#8E4FB0", event: "#E5602F", civic: "#2E83C9", park: "#3FA66A", food: "#F0B429" },
    tint: { brew: "#1E2228", arts: "#1E2228", event: "#1E2228", neutral: "#1E2228", brand: "#231A16" },
    tileBg: "#1E2228", chipBg: "#23282F", chipInk: "#C9CED4",
    dispFam: "sans", numFam: "sans", rLg: 18, rMd: 14, rSm: 9,
  },
];

const SCREENS = [
  ["Today", screenToday], ["Map", screenMap], ["Events", screenEvents], ["My Radius", screenRadius],
];

// ── compose one look (2x2 of phones) ────────────────────────────────
const SCALE = 2;
function buildLook(th) {
  const M = 56, GAPX = 64, GAPY = 92, HEAD = 150, LBL = 32;
  const W = M + 380 + GAPX + 380 + M; // 936
  const H = 60 + HEAD + (LBL + 800 + GAPY) + (LBL + 800) + 56;
  let body = r(0, 0, W, H, { fill: th.canvasBg });
  // header
  body += t(M, 96, "FREDERICK RADIUS", { size: 13, w: 700, fill: th.headerSub, fam: "mono", track: 4 });
  body += t(M, 140, th.name, { size: 46, w: 700, fill: th.headerInk, fam: th.dispFam });
  body += t(M, 172, th.tagline, { size: 17, w: 400, fill: th.headerSub, fam: "sans" });
  body += t(W - M, 140, "LOOK " + th.key, { size: 40, w: 700, fill: th.headerInk, fam: th.numFam, anchor: "end", op: 0.25 });
  body += t(W - M, 172, th.ref, { size: 12, w: 400, fill: th.headerSub, fam: "mono", anchor: "end" });
  body += ln(M, 198, W - M, 198, { stroke: th.headerSub, sw: 1, op: 0.4 });
  // phones
  const cells = [[M, 60 + HEAD], [M + 380 + GAPX, 60 + HEAD], [M, 60 + HEAD + LBL + 800 + GAPY], [M + 380 + GAPX, 60 + HEAD + LBL + 800 + GAPY]];
  SCREENS.forEach(([label, fn], i) => {
    const [x, y0] = cells[i];
    body += t(x + 6, y0 + 20, (i + 1) + " · " + label.toUpperCase(), { size: 13, w: 700, fill: th.headerSub, fam: "mono", track: 2 });
    body += G(x, y0 + LBL, device(th, fn(th)));
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * SCALE}" height="${H * SCALE}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
}

const OUT = {
  A: ".mockups/look-a-fieldguide.png",
  B: ".mockups/look-b-instrument.png",
  C: ".mockups/look-c-almanac-dark.png",
};
for (const th of THEMES) {
  const svg = buildLook(th);
  await sharp(Buffer.from(svg)).png().toFile(OUT[th.key]);
  console.log("rendered", OUT[th.key]);
}
console.log("done");
