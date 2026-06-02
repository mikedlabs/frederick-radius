import { chromium } from "playwright";
const BASE = process.env.BASE || "http://localhost:3105";
const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
  geolocation: { latitude: 39.4143, longitude: -77.4105 }, // downtown Frederick
  permissions: ["geolocation"],
});
const p = await ctx.newPage();
const unblank = async () => { await p.evaluate(() => { for (const d of document.querySelectorAll("div")) { const s = getComputedStyle(d); if (parseFloat(s.opacity) < 1) d.style.opacity = "1"; if (s.transform && s.transform !== "none") d.style.transform = "none"; } }); };
await p.goto(BASE + "/guide", { waitUntil: "networkidle", timeout: 45000 }).catch((e)=>console.log("goto:", e.message));
await p.waitForTimeout(2200); await unblank();
await p.getByText("Coffee", { exact: true }).first().click().catch((e)=>console.log("coffee:", e.message));
await p.waitForTimeout(1300); await unblank(); await p.waitForTimeout(200);
await p.screenshot({ path: "/tmp/render/ORD_before_geo.png" }); // top picks (no location yet)
// trigger location -> blended "best nearby"
const near = p.getByRole("button", { name: /Near me/i }).first();
if (await near.count().catch(()=>0)) { await near.click().catch(()=>{}); await p.waitForTimeout(1600); await unblank(); await p.waitForTimeout(200); }
else { console.log("no Near me button"); }
await p.screenshot({ path: "/tmp/render/ORD_after_geo.png" }); // best nearby (located)
console.log("geo status text present:", await p.getByText(/best nearby|top picks/i).count().catch(()=>0));
await b.close();
console.log("ORDER RENDER DONE");
