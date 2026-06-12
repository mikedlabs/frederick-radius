// tests/clutter.spec.ts
// The regression gate from the subtraction brief (June 12, 2026).
// Run against production or a preview: BASE_URL=https://preview-url npx playwright test
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'https://frederickradius.app';
const PAGES = ['/', '/today', '/events', '/map'];

for (const path of PAGES) {
  test(`clutter contract: ${path}`, async ({ page }) => {
    await page.goto(`${BASE}${path}`);

    // Rule 4: no page-level text inputs. The command sheet's input lives in a
    // dialog and is exempt; everything inside <main> must be input-free.
    const inputs = await page
      .locator('main input[type="text"], main input[type="search"], main input:not([type])')
      .count();
    expect(inputs, 'one search system only; no inputs in main').toBe(0);

    // Rule 3: counts are never content.
    const body = await page.locator('main').innerText();
    expect(body, 'no stat cards').not.toMatch(/\d+\s+places open/i);

    // Rule 2: no entity rendered twice on one screen.
    const titles = (await page.locator('main h3').allInnerTexts()).map(t => t.trim());
    const dupes = titles.filter((t, i) => t && titles.indexOf(t) !== i);
    expect(dupes, `duplicated on screen: ${dupes.join(', ')}`).toHaveLength(0);

    // No nav destination may 404.
    const hrefs = await page.locator('nav a').evaluateAll(as =>
      as.map(a => a.getAttribute('href')).filter(Boolean)
    );
    for (const href of [...new Set(hrefs)]) {
      if (href!.startsWith('/')) {
        const res = await page.request.get(`${BASE}${href}`);
        expect(res.status(), `${href} from nav`).toBeLessThan(400);
      }
    }
  });
}

test('count integrity: /events', async ({ page }) => {
  await page.goto(`${BASE}/events`);
  // Every visible "N" in a section heading must equal the cards in that section.
  const sections = page.locator('main section:has(h2)');
  const n = await sections.count();
  for (let i = 0; i < n; i++) {
    const s = sections.nth(i);
    const label = await s.locator('h2').first().innerText();
    const m = label.match(/(\d+)/);
    if (!m) continue;
    const cards = await s.locator('h3').count();
    expect(cards, `"${label}" claims ${m[1]} but renders ${cards}`).toBe(parseInt(m[1], 10));
  }
});

test('routes: twins are redirects', async ({ request }) => {
  for (const twin of ['/radius', '/guide', '/pulse']) {
    const res = await request.get(`${BASE}${twin}`, { maxRedirects: 0 });
    expect([301, 308], `${twin} should permanently redirect`).toContain(res.status());
  }
});

test('payload budgets', async ({ request }) => {
  const budgets: Record<string, number> = { '/today': 150_000, '/events': 300_000 };
  for (const [path, max] of Object.entries(budgets)) {
    const res = await request.get(`${BASE}${path}`);
    const bytes = (await res.body()).length;
    expect(bytes, `${path} decoded HTML over budget`).toBeLessThan(max);
  }
});
