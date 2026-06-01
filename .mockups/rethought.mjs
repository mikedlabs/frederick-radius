// Frederick Radius — 10 completely rethought Find-screen layouts.
// Each is a distinct paradigm, not a palette swap. HTML -> PNG via Playwright.
//   node .mockups/rethought.mjs
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const HEAD = `<meta charset="utf8"><meta name="viewport" content="width=440">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,900&family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@400;500;700&family=JetBrains+Mono:wght@400;500;700&family=Newsreader:opsz,wght@6..72,300;6..72,500&display=swap" rel="stylesheet">`;
const BASE = `*{margin:0;padding:0;box-sizing:border-box}
:root{--cream:#EFE8DA;--paper:#FFFDF8;--sand:#E6DECE;--ink:#1A1815;--ink2:#4A4844;--ink3:#6B6459;--line:#D6CDBB;--brick:#A03A22;--gold:#C99632;--green:#1E6B3A;--cool:#2F5470;--plum:#7E2C6F;-- tan:#8B5A2B;--ink9:#0E0F12;}
.serif{font-family:'Fraunces',Georgia,serif}.news{font-family:'Newsreader',Georgia,serif}.sans{font-family:'Inter',system-ui,sans-serif}.grot{font-family:'Space Grotesk','Inter',sans-serif}.mono{font-family:'JetBrains Mono',ui-monospace,monospace}
body{font-family:'Inter',system-ui,sans-serif;width:440px}
.scr{width:440px;min-height:920px;position:relative;overflow:hidden}
.up{text-transform:uppercase;letter-spacing:.16em}`;
const doc = (css, body) => `<!doctype html><html><head>${HEAD}<style>${BASE}${css}</style></head><body>${body}</body></html>`;

const intents = [["Eat & drink","🍽","var(--brick)",298],["Coffee","☕","var(--tan)",90],["Get outside","🌲","var(--green)",171],["Shops & makers","🛍","var(--cool)",322],["Arts & culture","🎭","var(--plum)",98],["Take the kids","🧸","var(--gold)",96],["Stay the night","🛏","#5B1E55",42],["Faith & worship","⛪","#5B3A8F",167]];
const events = [["5:00","Alive @ Five","Carroll Creek Amphitheater"],["6:30","Sky Stage Open Mic","Sky Stage"],["7:00","Mack Berry Band","Tenth Ward Distilling"],["8:00","First Friday Art Walk","Market Street"]];

// ── 01 · RADIAL DIAL ────────────────────────────────────────────────
function radial(){
  const labels=["Eat","Coffee","Outside","Shops","Arts","Kids","Stay","Faith"];
  const pts=labels.map((l,i)=>{const a=(i/labels.length)*Math.PI*2-Math.PI/2;const r=158;return `<div class="rl" style="left:${220+Math.cos(a)*r}px;top:${430+Math.sin(a)*r}px">${l}</div>`;}).join("");
  return doc(`.scr{background:radial-gradient(120% 90% at 50% 18%,#15171C,#0B0C10)}
  .top{position:absolute;top:40px;left:0;right:0;text-align:center;color:#EDE7D7}
  .eb{font-size:11px;color:#8C9384}.eb b{color:var(--gold)}
  .h{font-size:30px;margin-top:6px}
  .dial{position:absolute;left:60px;top:270px;width:320px;height:320px;border-radius:50%;border:1px solid #2A2E36;box-shadow:0 0 80px -20px rgba(216,162,74,.25) inset}
  .dial:before{content:"";position:absolute;inset:46px;border-radius:50%;border:1px dashed #2A2E36}
  .dial:after{content:"";position:absolute;inset:96px;border-radius:50%;border:1px solid #353A44}
  .core{position:absolute;left:50%;top:430px;transform:translate(-50%,-50%);text-align:center;color:#F3EEDF}
  .core .t{font-size:46px;line-height:1}.core .s{font-size:11px;color:#9AA0AA;margin-top:4px}
  .rl{position:absolute;transform:translate(-50%,-50%);font-size:14px;color:#E7E2D3;font-weight:600;background:#16181D;border:1px solid #2A2E36;padding:7px 12px;border-radius:999px}
  .rl:nth-child(1),.rl:nth-child(3){color:var(--gold);border-color:#48402a}
  .ftr{position:absolute;left:0;right:0;bottom:46px;text-align:center;color:#9AA0AA;font-size:12px}
  .ftr b{color:#5BD6A0}`,
  `<div class="scr"><div class="top"><div class="eb up">Within reach · <b>71° clear</b></div><div class="h serif">What's around you?</div></div>
  <div class="dial"></div>${pts}<div class="core"><div class="t serif">71°</div><div class="s mono up">FREDERICK · DOWNTOWN</div></div>
  <div class="ftr">● <b>142 open now</b> &nbsp;·&nbsp; a 15-min walk in any direction</div></div>`);
}

// ── 02 · ALMANAC INDEX ──────────────────────────────────────────────
function index(){
  const rows=intents.map((d,i)=>`<div class="row"><span class="no mono">${String(i+1).padStart(2,"0")}</span><span class="nm serif">${d[0]}</span><span class="dots"></span><span class="ct mono">${d[3]}</span></div>`).join("");
  return doc(`.scr{background:var(--cream);padding:34px 30px}
  .mast{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid var(--ink);padding-bottom:8px}
  .mast .ttl{font-size:14px;font-weight:700;letter-spacing:.14em}.mast .no{font-size:11px;color:var(--ink3)}
  .sub{display:flex;justify-content:space-between;font-size:10px;color:var(--ink3);letter-spacing:.12em;padding:7px 0;border-bottom:1px solid var(--line)}
  .hh{font-size:40px;line-height:1.04;margin:22px 0 4px}
  .lede{font-size:13px;color:var(--ink3);font-style:italic;margin-bottom:18px}
  .sec{font-size:10px;letter-spacing:.18em;color:var(--brick);margin:18px 0 6px}
  .row{display:flex;align-items:baseline;gap:10px;padding:11px 0;border-bottom:1px solid var(--line)}
  .no{font-size:12px;color:var(--ink3);width:22px}.nm{font-size:20px;flex:0 0 auto}
  .dots{flex:1;border-bottom:1.5px dotted var(--line);transform:translateY(-4px)}
  .ct{font-size:12px;color:var(--ink2)}
  .marg{margin-top:18px;font-size:11px;color:var(--ink3);font-style:italic;border-left:2px solid var(--gold);padding-left:10px}`,
  `<div class="scr"><div class="mast"><span class="ttl up">The Frederick Almanac</span><span class="no mono">No. 147</span></div>
  <div class="sub up"><span>Saturday · 30 May</span><span>Clear · 71°</span><span>142 open</span></div>
  <h1 class="hh serif">What do you<br>need today?</h1><div class="lede news">An index to the county — turn to any line.</div>
  <div class="sec up">I · Out & about</div>${rows}
  <div class="marg">Tonight: Alive @ Five on the Creek, 5–8pm. First Friday art walk down Market St.</div></div>`);
}

// ── 03 · CARD DECK ──────────────────────────────────────────────────
function deck(){
  return doc(`.scr{background:#0C0D10}
  .deck{position:relative;margin:24px;height:660px}
  .c{position:absolute;inset:0;border-radius:28px;overflow:hidden}
  .c2{transform:scale(.93) translateY(-22px);filter:brightness(.5);background:#23262E}
  .c1{transform:scale(.965) translateY(-11px);filter:brightness(.7);background:#2E323C}
  .c0{background:linear-gradient(160deg,#6E4A2E,#3A2417);box-shadow:0 30px 60px -20px rgba(0,0,0,.7)}
  .img{position:absolute;inset:0;background:radial-gradient(120% 80% at 70% 20%,rgba(216,162,74,.5),transparent 60%),linear-gradient(180deg,rgba(0,0,0,.1),rgba(0,0,0,.85))}
  .badge{position:absolute;top:18px;left:18px;background:rgba(255,255,255,.92);color:#1A1815;font-size:10px;font-weight:700;letter-spacing:.12em;padding:6px 11px;border-radius:999px}
  .heart{position:absolute;top:16px;right:18px;width:34px;height:34px;border-radius:50%;background:rgba(0,0,0,.35);backdrop-filter:blur(6px);color:#fff;display:grid;place-items:center;font-size:16px}
  .meta{position:absolute;left:22px;right:22px;bottom:104px;color:#F4EFE3}
  .meta .k{font-size:11px;letter-spacing:.14em;opacity:.8}.meta h2{font-size:34px;line-height:1.04;margin:6px 0}
  .meta .r{font-size:13px;opacity:.92;margin-top:8px}.meta .r b{color:#5BD6A0}
  .bar{position:absolute;left:18px;right:18px;bottom:22px;display:flex;gap:10px}
  .btn{flex:1;height:52px;border-radius:16px;display:flex;align-items:center;justify-content:center;gap:8px;font-weight:700;font-size:15px}
  .b1{background:#F4EFE3;color:#1A1815}.b2{background:rgba(255,255,255,.12);color:#F4EFE3;border:1px solid rgba(255,255,255,.2)}
  .dots{position:absolute;left:0;right:0;top:8px;text-align:center;color:#6b6f78;letter-spacing:6px;font-size:9px}
  .hd{padding:26px 26px 0;color:#EDE7D7}.hd .e{font-size:11px;color:#8C9384}.hd h1{font-size:26px;margin-top:4px}`,
  `<div class="scr"><div class="hd"><div class="e up">Good evening · the answer</div><h1 class="serif">Tonight, near you</h1></div>
  <div class="deck"><div class="dots">○ ● ○ ○</div><div class="c c2"></div><div class="c c1"></div>
  <div class="c c0"><div class="img"></div><div class="badge up">Live music · 7pm</div><div class="heart">♥</div>
  <div class="meta"><div class="k up grot">Distillery · Downtown</div><h2 class="serif">Tenth Ward Distilling</h2><div class="r"><b>Open till 11</b> · 4-min walk · Mack Berry Band tonight</div></div>
  <div class="bar"><div class="btn b1">Directions</div><div class="btn b2">Details</div></div></div></div></div>`);
}

// ── 04 · SPLIT COVER ────────────────────────────────────────────────
function cover(){
  const tiles=intents.slice(0,6).map(d=>`<div class="t"><span class="g">${d[1]}</span><span class="nm serif">${d[0]}</span></div>`).join("");
  return doc(`.scr{background:var(--cream)}
  .hero{height:476px;position:relative;background:linear-gradient(165deg,#9C6B3F,#4A3322);overflow:hidden;color:#F6F0E2}
  .hero:after{content:"";position:absolute;inset:0;background:radial-gradient(120% 70% at 80% 10%,rgba(216,162,74,.45),transparent 55%),linear-gradient(180deg,transparent 40%,rgba(20,12,8,.55))}
  .mh{position:absolute;top:26px;left:26px;right:26px;display:flex;justify-content:space-between;font-size:11px;letter-spacing:.16em;z-index:2}
  .cov{position:absolute;left:26px;right:26px;bottom:96px;z-index:2}
  .cov .k{font-size:12px;letter-spacing:.18em;opacity:.85}.cov h1{font-size:58px;line-height:.96;margin-top:8px;font-weight:600}
  .cov .d{font-size:14px;opacity:.92;margin-top:12px;max-width:300px;font-style:italic}
  .issue{position:absolute;left:26px;bottom:30px;font-size:11px;letter-spacing:.14em;opacity:.8;z-index:2}
  .grid{padding:22px 22px 30px}.gl{font-size:10px;letter-spacing:.18em;color:var(--brick);margin-bottom:12px}
  .tg{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
  .t{background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:14px 10px;display:flex;flex-direction:column;gap:8px;box-shadow:0 4px 12px -6px rgba(20,18,16,.14)}
  .t .g{font-size:22px}.t .nm{font-size:14px;line-height:1.05}`,
  `<div class="scr"><div class="hero"><div class="mh up"><span>Frederick Radius</span><span>№ 147</span></div>
  <div class="cov"><div class="k up grot">The Saturday Issue</div><h1 class="serif">A day<br>worth<br>leaving for.</h1><div class="d news">Clear skies, 71°. Three festivals, a creek, and a town that shows up.</div></div>
  <div class="issue up">Open this issue ↓</div></div>
  <div class="grid"><div class="gl up">Start anywhere</div><div class="tg">${tiles}</div></div></div>`);
}

// ── 05 · DEPARTURE BOARD ────────────────────────────────────────────
function board(){
  const open=[["NOW","Tenth Ward Distilling","OPEN · LIVE MUSIC"],["NOW","Cafe Nola","OPEN · TILL 11"],["5:00","Alive @ Five","CARROLL CREEK"],["6:30","Sky Stage","OPEN MIC"],["7:00","Mack Berry Band","TENTH WARD"],["8:00","First Friday","MARKET ST"]];
  const rows=open.map(r=>`<div class="r"><span class="tm">${r[0]}</span><span class="nm">${r[1]}</span><span class="st">${r[2]}</span></div>`).join("");
  return doc(`.scr{background:#0A0A0B;padding:30px 22px;color:#F0C24B;font-family:'JetBrains Mono',monospace}
  .hd{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #2A2208;padding-bottom:12px}
  .hd .l{font-size:18px;font-weight:700;letter-spacing:.1em;color:#F4EFE3}.hd .r{font-size:11px;color:#7a6a2a}
  .sub{display:flex;justify-content:space-between;color:#6f6326;font-size:10px;letter-spacing:.18em;padding:12px 2px 6px}
  .r{display:grid;grid-template-columns:54px 1fr auto;gap:12px;align-items:center;padding:15px 2px;border-bottom:1px solid #1c1808}
  .tm{font-size:15px;font-weight:700;color:#F0C24B}.nm{font-size:16px;color:#F4EFE3;font-weight:500;font-family:'Space Grotesk',sans-serif}
  .st{font-size:10px;letter-spacing:.1em;color:#5BD6A0}
  .r:nth-child(odd) .tm{color:#FF7A4D}
  .ft{margin-top:20px;font-size:11px;color:#6f6326;letter-spacing:.14em;text-align:center}`,
  `<div class="scr"><div class="hd"><span class="l">FREDERICK · NOW</span><span class="r">71° CLR</span></div>
  <div class="sub up"><span>Time</span><span>What's on</span><span>Status</span></div>${rows}
  <div class="ft up">▸ flips live · 142 places open right now</div></div>`);
}

// ── 06 · BENTO OS ───────────────────────────────────────────────────
function bento(){
  return doc(`.scr{background:#E9E3D6;padding:22px}
  .e{font-size:11px;letter-spacing:.14em;color:var(--ink3)}.h{font-size:28px;margin:4px 0 16px}
  .grid{display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:108px;gap:12px}
  .b{border-radius:22px;padding:16px;position:relative;overflow:hidden;box-shadow:0 8px 20px -10px rgba(20,18,16,.18)}
  .w{grid-column:span 2;grid-row:span 2;background:linear-gradient(160deg,#7FB0D8,#3F6B8E);color:#fff}
  .w .t{font-size:54px;line-height:1;font-weight:600}.w .c{font-size:14px;opacity:.9}.w .lo{position:absolute;bottom:14px;left:16px;font-size:12px;opacity:.85}
  .open{background:#1E6B3A;color:#fff}.open .n{font-size:40px;font-weight:700;font-family:'Space Grotesk'}
  .ask{background:var(--ink);color:var(--cream)}.ask .q{font-size:15px;font-weight:600;margin-top:18px}
  .ev{grid-row:span 2;background:#7E2C6F;color:#fff}.ev .row{font-size:12px;opacity:.95;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.18)}
  .pl{background:linear-gradient(160deg,#B5774A,#6E4A2E);color:#fff;grid-column:span 1}
  .lbl{font-size:10px;letter-spacing:.14em;text-transform:uppercase;opacity:.8}
  .b .big{font-family:'Fraunces',serif}`,
  `<div class="scr"><div class="e up">Saturday · Good morning</div><div class="h serif">Today in Frederick</div>
  <div class="grid">
   <div class="b w"><div class="lbl">Now · Clear</div><div class="t serif">71°</div><div class="c">Sun all afternoon · patio weather</div><div class="lo">H 78° · L 56°</div></div>
   <div class="b open"><div class="lbl">Open now</div><div class="n">142</div><div class="lbl">tap to see</div></div>
   <div class="b ask"><div class="lbl">Ask Frederick</div><div class="q serif">"Coffee open past 9 near the creek?"</div></div>
   <div class="b ev"><div class="lbl" style="margin-bottom:8px">Tonight · 4</div><div class="row">5:00 Alive @ Five</div><div class="row">6:30 Sky Stage</div><div class="row">7:00 Mack Berry Band</div><div class="row" style="border:0">8:00 First Friday</div></div>
   <div class="b pl"><div class="lbl">Local favorite</div><div class="big" style="font-size:18px;margin-top:22px">Tenth Ward</div><div style="font-size:11px;opacity:.85">Open · live music</div></div>
  </div></div>`);
}

// ── 07 · MAP CANVAS ─────────────────────────────────────────────────
function mapc(){
  const pins=[[120,300,"☕","var(--tan)"],[300,260,"🍽","var(--brick)"],[210,360,"🎭","var(--plum)"],[330,420,"🌲","var(--green)"],[150,470,"🛍","var(--cool)"]];
  const p=pins.map(P=>`<div class="pin" style="left:${P[0]}px;top:${P[1]}px;--c:${P[3]}">${P[2]}</div>`).join("");
  return doc(`.scr{background:#E4E9E0}
  .map{position:absolute;inset:0;background:
   radial-gradient(60% 40% at 30% 20%,#EEF1EA,transparent),
   radial-gradient(50% 40% at 80% 70%,#E0E7DC,transparent),#E7ECE3}
  .creek{position:absolute;left:-20px;top:340px;width:480px;height:60px;background:linear-gradient(90deg,#9FC2D8,#7FB0D8);transform:rotate(-8deg);opacity:.7;border-radius:40px;filter:blur(1px)}
  .road{position:absolute;background:#fff;opacity:.7}
  .pin{position:absolute;transform:translate(-50%,-50%);width:46px;height:46px;border-radius:50% 50% 50% 4px;background:#fff;border:2px solid var(--c);display:grid;place-items:center;font-size:18px;box-shadow:0 8px 16px -6px rgba(0,0,0,.3);rotate:45deg}
  .pin>*{rotate:-45deg}
  .search{position:absolute;top:54px;left:20px;right:20px;height:52px;background:rgba(255,255,255,.85);backdrop-filter:blur(12px);border:1px solid #fff;border-radius:16px;display:flex;align-items:center;padding:0 16px;gap:10px;box-shadow:0 10px 30px -12px rgba(0,0,0,.25)}
  .search .q{color:var(--ink3);font-size:15px}
  .chips{position:absolute;top:122px;left:20px;right:0;display:flex;gap:8px;overflow:hidden}
  .chip{background:rgba(255,255,255,.9);border:1px solid #fff;border-radius:999px;padding:8px 13px;font-size:12px;font-weight:600;color:var(--ink2);white-space:nowrap;box-shadow:0 4px 12px -6px rgba(0,0,0,.2)}
  .chip.on{background:var(--ink);color:#fff}
  .sheet{position:absolute;left:0;right:0;bottom:0;background:var(--paper);border-radius:26px 26px 0 0;padding:18px 20px 30px;box-shadow:0 -16px 40px -20px rgba(0,0,0,.3)}
  .grip{width:40px;height:5px;border-radius:3px;background:var(--line);margin:0 auto 14px}
  .sheet h3{font-size:22px}.sheet .s{font-size:13px;color:var(--ink3);margin-top:2px}
  .mini{display:flex;gap:10px;margin-top:14px}.card{flex:1;background:var(--cream);border:1px solid var(--line);border-radius:14px;padding:12px}
  .card .n{font-size:14px;font-weight:700}.card .m{font-size:11px;color:var(--ink3);margin-top:3px}`,
  `<div class="scr"><div class="map"></div><div class="creek"></div>
  <div class="road" style="left:0;top:300px;width:440px;height:8px"></div><div class="road" style="left:210px;top:0;width:8px;height:920px"></div>
  ${p}
  <div class="search"><span style="font-size:16px">⌕</span><span class="q">Coffee, tacos, live music…</span></div>
  <div class="chips"><div class="chip on">Open now</div><div class="chip">Eat</div><div class="chip">Coffee</div><div class="chip">Outdoors</div><div class="chip">Arts</div></div>
  <div class="sheet"><div class="grip"></div><h3 class="serif">12 open within a 5-min walk</h3><div class="s">Nearest first · downtown Frederick</div>
   <div class="mini"><div class="card"><div class="n">Cafe Nola</div><div class="m">Coffee · open till 11 · 2 min</div></div><div class="card"><div class="n">Tenth Ward</div><div class="m">Live music · open · 4 min</div></div></div></div></div>`);
}

// ── 08 · DAY RIBBON ─────────────────────────────────────────────────
function ribbon(){
  const stops=[["8a","☕","Coffee","Cafe Nola"],["12p","🍽","Lunch","Bentztown"],["3p","🌲","A walk","Baker Park"],["5p","🎶","Alive @ Five","Carroll Creek"],["8p","🍸","Nightcap","Tenth Ward"]];
  const items=stops.map((s,i)=>`<div class="stop"><div class="time mono">${s[0]}</div><div class="node" style="--i:${i}">${s[1]}</div><div class="card"><div class="k up">${s[2]}</div><div class="nm serif">${s[3]}</div></div></div>`).join("");
  return doc(`.scr{background:linear-gradient(180deg,#F3D9A8 0%,#EFE8DA 26%,#EFE8DA 100%);padding:34px 26px}
  .e{font-size:11px;letter-spacing:.14em;color:var(--ink3)}.h{font-size:34px;margin:4px 0 4px}.ld{font-size:13px;color:var(--ink3);font-style:italic;margin-bottom:8px}
  .sun{position:absolute;top:14px;right:26px;width:64px;height:64px;border-radius:50%;background:radial-gradient(circle,#F6C453,#E59A2B);box-shadow:0 0 40px -4px rgba(229,154,43,.6)}
  .rail{position:relative;margin-top:18px;padding-left:6px}
  .rail:before{content:"";position:absolute;left:54px;top:6px;bottom:6px;width:2px;background:linear-gradient(180deg,var(--gold),var(--line))}
  .stop{display:grid;grid-template-columns:44px 28px 1fr;gap:12px;align-items:center;margin-bottom:14px}
  .time{font-size:13px;color:var(--ink3);text-align:right}
  .node{width:28px;height:28px;border-radius:50%;background:var(--paper);border:2px solid var(--gold);display:grid;place-items:center;font-size:13px;z-index:2}
  .card{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:11px 14px;box-shadow:0 4px 12px -6px rgba(20,18,16,.14)}
  .card .k{font-size:9px;letter-spacing:.14em;color:var(--brick)}.card .nm{font-size:17px;margin-top:1px}
  .ft{margin-top:6px;text-align:center;font-size:12px;color:var(--brick);font-weight:600}`,
  `<div class="scr"><div class="sun"></div><div class="e up">Saturday · your day</div><h1 class="h serif">A perfect Saturday,<br>hour by hour.</h1><div class="ld news">Built from what's open and what's on.</div>
  <div class="rail">${items}</div><div class="ft">Shuffle the day  ↻</div></div>`);
}

// ── 09 · CONCIERGE ──────────────────────────────────────────────────
function ask(){
  const sugg=["What's open late?","Live music tonight","Rainy day with a 5-yr-old","A good first date spot"];
  const chips=sugg.map(s=>`<div class="sg">${s}</div>`).join("");
  return doc(`.scr{background:var(--cream);padding:0 26px;display:flex;flex-direction:column;min-height:920px}
  .top{flex:1;display:flex;flex-direction:column;justify-content:center;padding-top:40px}
  .mark{width:46px;height:46px;border-radius:14px;background:var(--brick);color:#fff;display:grid;place-items:center;font-size:22px;margin-bottom:20px}
  .h{font-size:42px;line-height:1.02}.h .g{color:var(--ink3)}
  .ans{margin-top:24px;background:var(--paper);border:1px solid var(--line);border-radius:20px;padding:16px 18px;box-shadow:0 10px 26px -14px rgba(20,18,16,.2)}
  .ans .q{font-size:12px;color:var(--ink3);font-style:italic}.ans .a{font-size:15px;margin-top:8px;line-height:1.5}
  .ans .a b{color:var(--brick)}
  .ans .pill{display:inline-block;margin-top:12px;background:var(--cream);border:1px solid var(--line);border-radius:999px;padding:6px 12px;font-size:12px;font-weight:600}
  .sgs{display:flex;flex-wrap:wrap;gap:8px;margin:22px 0}
  .sg{background:var(--paper);border:1px solid var(--line);border-radius:999px;padding:9px 14px;font-size:13px;color:var(--ink2);font-weight:500}
  .bar{margin-bottom:30px;background:var(--paper);border:1.5px solid var(--ink);border-radius:18px;padding:15px 16px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 8px 20px -10px rgba(20,18,16,.2)}
  .bar .p{color:var(--ink3);font-size:16px}.bar .send{width:38px;height:38px;border-radius:12px;background:var(--brick);color:#fff;display:grid;place-items:center}`,
  `<div class="scr"><div class="top"><div class="mark">◎</div><h1 class="h serif">Ask Frederick<br><span class="g">anything.</span></h1>
   <div class="ans"><div class="q">"coffee open past 9 near Carroll Creek"</div><div class="a">Two spots — <b>Cafe Nola</b> (open till 11, 2-min walk) and <b>North Market</b> (till 10). Both have patio seating tonight.</div><span class="pill">☕ See both →</span></div>
   <div class="sgs">${chips}</div></div>
   <div class="bar"><span class="p">What are you in the mood for?</span><span class="send">↑</span></div></div>`);
}

// ── 10 · SWISS POSTER ───────────────────────────────────────────────
function poster(){
  const list=intents.slice(0,6).map((d,i)=>`<div class="li"><span class="n mono">/${String(i+1).padStart(2,"0")}</span><span class="t">${d[0]}</span></div>`).join("");
  return doc(`.scr{background:#F4F3EF;padding:32px 26px;color:#0A0A0A}
  .bar{display:flex;justify-content:space-between;font-size:11px;letter-spacing:.1em;border-bottom:2px solid #0A0A0A;padding-bottom:8px}
  .big{font-size:120px;line-height:.82;font-weight:800;letter-spacing:-.04em;margin:18px 0 0}
  .red{color:#E5231B}
  .row2{display:flex;justify-content:space-between;align-items:flex-end;margin-top:2px}
  .sub{font-size:13px;max-width:200px;line-height:1.3}
  .num{font-size:64px;font-weight:800;letter-spacing:-.03em}
  .img{height:150px;margin:20px 0;background:linear-gradient(120deg,#E5231B,#0A0A0A);position:relative;overflow:hidden}
  .img:after{content:"FREDERICK";position:absolute;bottom:8px;left:12px;color:#F4F3EF;font-size:13px;letter-spacing:.3em;font-weight:700}
  .li{display:flex;align-items:baseline;gap:14px;padding:10px 0;border-bottom:1px solid #d8d6cf}
  .li .n{font-size:13px;color:#E5231B;font-weight:700}.li .t{font-size:22px;font-weight:700;font-family:'Space Grotesk',sans-serif}
  .ft{display:flex;justify-content:space-between;font-size:11px;letter-spacing:.1em;margin-top:14px}`,
  `<div class="scr"><div class="bar up grot"><span>Frederick Radius</span><span>71° / SAT / No.147</span></div>
  <div class="big grot">FIND<span class="red">.</span></div>
  <div class="row2"><div class="sub grot">Everything worth doing in the county, in one move.</div><div class="num grot red">142</div></div>
  <div class="img"></div>
  ${list}
  <div class="ft up grot"><span>Tap a number ↗</span><span>Open now · tonight · near you</span></div></div>`);
}

const LOOKS=[["01-radial",radial],["02-index",index],["03-deck",deck],["04-cover",cover],["05-board",board],["06-bento",bento],["07-map",mapc],["08-ribbon",ribbon],["09-ask",ask],["10-poster",poster]];

const dir=".mockups/rethought";fs.mkdirSync(dir,{recursive:true});
const out=".mockups/render";fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:440,height:920},deviceScaleFactor:2});
for(const [id,fn] of LOOKS){
  const html=fn();const hp=path.join(dir,id+".html");fs.writeFileSync(hp,html);
  await page.goto("file://"+path.resolve(hp),{waitUntil:"networkidle"});
  await page.waitForTimeout(400);
  const pp=path.join(out,"rt-"+id+".png");await page.screenshot({path:pp,fullPage:true});
  console.log("rendered",id,Math.round(fs.statSync(pp).size/1024)+"kb");
}
await browser.close();console.log("DONE 10 rethought looks");
