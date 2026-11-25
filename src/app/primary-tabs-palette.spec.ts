// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import postcss from "postcss";
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import MapPeek from "@/components/map/MapPeek";
import PulseIndicator from "@/components/nav/PulseIndicator";
import TodayPlanTonightLink from "@/components/today/TodayPlanTonightLink";
import { TodayEventsRecoveryView } from "@/components/today/TodayEventsRecovery";
import { ReasonChipRow } from "@/components/ui/ReasonChip";
import { eventReasons } from "@/lib/event-reasons";
import EventSheet from "@/components/event/EventSheet";
import SavedEventWallet from "@/components/saved/SavedEventWallet";
import type { MapPinPlace } from "@/components/map/types";
import type { OpenStatus } from "@/lib/hours";
import type { CountyStatusSummary } from "@/lib/pulse/county-status";
import type { EventWithMeta } from "@/lib/loaders/events";

const navigation = vi.hoisted(() => ({ pathname: "/today" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
// The shell's portal/focus/drag behavior is covered separately. Render the
// actual event content here so contrast checks follow the roles it paints.
vi.mock("@/components/ui/BottomSheet", () => ({
  default: ({ children, present }: { children: (dismiss: () => void) => ReactNode; present: boolean }) => present ? children(() => {}) : null,
  SheetHandle: () => null,
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const stylesheet = postcss.parse(readFileSync("src/app/globals.css", "utf8"));
const findStyles = postcss.parse(readFileSync("src/components/today/TodayAsk.module.css", "utf8"));
type RGB = [number, number, number];

function palette(dark: boolean): Map<string, string> {
  const values = new Map<string, string>();
  stylesheet.walkRules((rule) => {
    const matches = rule.selector === ":root" || (dark && rule.selector === ':root[data-appearance="dark"]');
    if (!matches || rule.parent?.type === "atrule") return;
    rule.walkDecls(/^--/, (declaration) => { values.set(declaration.prop, declaration.value); });
  });
  return values;
}

function resolveColor(values: Map<string, string>, expression: string, backdrop?: RGB): RGB {
  if (expression === "transparent" && backdrop) return backdrop;
  const variable = expression.match(/^var\((--[\w-]+)(?:,\s*([^)]*))?\)$/);
  if (variable) {
    const value = values.get(variable[1]) ?? variable[2];
    if (!value) throw new Error(`Missing palette token ${variable[1]}`);
    return resolveColor(values, value, backdrop);
  }
  const hex = expression.match(/^#([\da-f]{6})$/i);
  if (hex) return [0, 2, 4].map((offset) => parseInt(hex[1].slice(offset, offset + 2), 16)) as RGB;
  const mix = expression.match(/^color-mix\(in srgb, (.+) (\d+(?:\.\d+)?)%, (.+)\)$/);
  if (mix) {
    const first = resolveColor(values, mix[1].trim(), backdrop);
    const second = resolveColor(values, mix[3].trim(), backdrop);
    const weight = Number(mix[2]) / 100;
    return first.map((channel, index) => channel * weight + second[index] * (1 - weight)) as RGB;
  }
  throw new Error(`Unsupported palette color ${expression}`);
}

function luminance(color: RGB): number {
  const linear = color.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(values: Map<string, string>, foreground: string, background: string): number {
  return expressionContrast(values, `var(${foreground})`, `var(${background})`);
}

function expressionContrast(values: Map<string, string>, foreground: string, background: string, backdrop = "var(--app-bg)"): number {
  const ground = resolveColor(values, background, resolveColor(values, backdrop));
  const light = luminance(resolveColor(values, foreground, ground));
  const dark = luminance(ground);
  return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
}

function declaration(css: postcss.Root, selector: string, property: string): string {
  let value: string | undefined;
  css.walkRules((rule) => {
    if (!rule.selector.split(",").some((part) => part.trim() === selector)) return;
    rule.walkDecls(property, (entry) => { value = entry.value; });
  });
  if (!value) throw new Error(`Missing ${selector} ${property}`);
  return value;
}

const detailEvent = {
  slug: "detail-contrast", title: "Community arts afternoon", description: "This is a sample event.",
  category: "arts", category_name: "Arts & culture", municipality: "frederick", municipality_name: "Frederick", venue_name: "Community hall", address: "Frederick County",
  starts_at: "2029-10-10T18:00:00.000Z", ends_at: "2029-10-10T20:00:00.000Z", timezone: "America/New_York",
  audience: [], is_free: true, is_verified: false, geom: { lat: 39.414, lng: -77.41 }, geo_confidence: "area", source: "manual", source_url: "https://example.com/event",
  source_id: "contrast-fixture", license: "Demonstration fixture", confidence: "curated", first_seen_at: "2029-10-01T12:00:00Z", last_verified_at: "2029-10-01T12:00:00Z",
} satisfies EventWithMeta;

/** Selector specificity as [ids, classes, types]. Enough for this sheet:
 *  :where() counts nothing, and :not() and :is() count their argument. */
function specificity(selector: string): number[] {
  let rest = selector.replace(/:where\((?:[^()]|\([^()]*\))*\)/g, "");
  const attributes = (rest.match(/\[[^\]]*\]/g) ?? []).length;
  rest = rest.replace(/\[[^\]]*\]/g, "").replace(/:(?:not|is)\(/g, "(");
  const pseudoElements = (rest.match(/::[\w-]+/g) ?? []).length;
  rest = rest.replace(/::[\w-]+/g, "");
  const ids = (rest.match(/#[\w-]+/g) ?? []).length;
  const classes = (rest.match(/\.[\w-]+|:[\w-]+/g) ?? []).length;
  const types = (rest.match(/(?:^|[\s>+~(])[a-z][\w-]*/g) ?? []).length;
  return [ids, classes + attributes, types + pseudoElements];
}

function outranks(rank: number[], other: number[]): boolean {
  const index = rank.findIndex((count, position) => count !== other[position]);
  return index === -1 || rank[index] > other[index]; // a tie goes to the later rule
}

/** The value a browser would cascade to the element from the sheet's
 *  unlayered top-level rules. A shorthand can be named with its longhand. */
function cascaded(element: Element, properties: string[]): string | undefined {
  let best: { rank: number[]; value: string } | undefined;
  stylesheet.walkRules((rule) => {
    if (rule.parent?.type !== "root") return;
    let value: string | undefined;
    rule.walkDecls((entry) => { if (properties.includes(entry.prop)) value = entry.value; });
    if (value === undefined) return;
    for (const part of rule.selector.split(",")) {
      let hit = false;
      try { hit = element.matches(part.trim()); } catch { /* a piece of a list that jsdom cannot parse */ }
      if (!hit) continue;
      const rank = specificity(part.trim());
      if (!best || outranks(rank, best.rank)) best = { rank, value };
    }
  });
  return best?.value;
}

function savedEventDeck(count: number, openIndex: number | null): DocumentFragment {
  const events = Array.from({ length: count }, (_, index) => ({ ...detailEvent, slug: `detail-${index}`, title: `Event ${index + 1}` }));
  const template = document.createElement("template");
  template.innerHTML = renderToStaticMarkup(createElement("div", { "data-app-primary-tab": "/my-radius" },
    createElement(SavedEventWallet, { events, now: new Date("2029-10-08T12:00:00.000Z"), openSlug: openIndex === null ? null : events[openIndex].slug })));
  return template.content;
}

describe("primary tab palette contrast", () => {
  it("lays every closed Saved card out as a row while an expanded card keeps the deck height", () => {
    // No minimum at all: the row is as tall as its name line and padding, so
    // enlarged text cannot reopen an empty band the way a rem minimum would.
    for (const [count, openIndex] of [[1, null], [1, 0], [2, null], [2, 1], [3, 1]] as const) {
      const deck = savedEventDeck(count, openIndex);
      const cards = [...deck.querySelectorAll(".sw-card")];
      expect(cards).toHaveLength(count);
      // A closed card is a row whether it is alone, first, middle or last.
      // No closed card keeps the old 186px box with a band under its name.
      expect(cards.map((card) => cascaded(card, ["min-height"])))
        .toEqual(cards.map((_, index) => (index === openIndex ? "186px" : "0")));
      // An event keeps its date on the narrowest phones; only a place row drops its fact there.
      expect(deck.querySelector('.sw-slot[id^="sw-slot-"]')).toBeNull();
    }
    const placeDeck = document.createElement("div");
    placeDeck.innerHTML = '<div data-app-primary-tab="/my-radius"><div class="sw-stack">'
      + '<div class="sw-slot" id="sw-slot-first"><div class="sw-card"></div></div>'
      + '<div class="sw-slot is-open" id="sw-slot-second"><div class="sw-card is-open"></div></div>'
      + '<div class="sw-slot" id="sw-slot-last"><div class="sw-card"></div></div></div></div>';
    expect([...placeDeck.querySelectorAll(".sw-card")].map((card) => cascaded(card, ["min-height"]))).toEqual(["0", "186px", "0"]);
  });
  it("stacks the Saved rows on one shared hairline with no tuck, on the heading's left edge", () => {
    // Every row after the first overlaps the one above by its 1px rule,
    // including the row after an opened one, and the first row has no
    // margin at all. This is the margin that reaches each real slot.
    const deck = savedEventDeck(4, 1);
    const slots = [...deck.querySelectorAll(".sw-slot")];
    expect(slots.map((slot) => cascaded(slot, ["margin-top", "margin", "margin-block", "margin-block-start"])))
      .toEqual([undefined, "-1px", "-1px", "-1px"]);
    // The retired tucked deck (-124px tuck, -64px raise, 10px drop) has no
    // rule left anywhere, scoped or not, so nothing has to out-rank it.
    stylesheet.walkRules((rule) => {
      if (!/\.sw-slot\b/.test(rule.selector)) return;
      rule.walkDecls(/^margin/, (entry) => { expect(`${rule.selector} ${entry.value}`).toMatch(/^\[data-app-primary-tab="\/my-radius"\] .* -1px$/); });
    });
    // One 6px corner at each end of the list and square corners at each seam.
    const cards = [...deck.querySelectorAll(".sw-card")];
    const corner = (card: Element, longhand: string) => cascaded(card, [longhand, "border-radius"]);
    expect(cards.map((card) => corner(card, "border-top-left-radius"))).toEqual(["var(--app-radius-md)", "0", "0", "0"]);
    expect(cards.map((card) => corner(card, "border-bottom-right-radius"))).toEqual(["0", "0", "0", "var(--app-radius-md)"]);
    // The single-event special case is gone because every closed card is a row now.
    stylesheet.walkRules((rule) => { expect(rule.selector).not.toContain(":first-child:last-child:not(.is-open)"); });
    // The deck shares the left edge of its headings and keeps its 30rem cap.
    const stack = deck.querySelector(".sw-stack")!;
    expect(cascaded(stack, ["max-width"])).toBe("30rem");
    expect(cascaded(stack, ["margin-inline", "margin"])).toBe("0");
    // No blank band between an opened name row and its ledger.
    expect(cascaded(cards[1].querySelector(".sw-face")!, ["min-height"])).toBe("0");
  });
  it("keeps the side and closing hairlines of an opened Saved row", () => {
    // The hairline is an inset shadow on the card, which a filled child
    // covers. The opened ledger must not paint a ground of its own.
    for (const openIndex of [1, 2]) {
      const deck = savedEventDeck(3, openIndex);
      const card = deck.querySelectorAll(".sw-card")[openIndex];
      expect(cascaded(card, ["box-shadow"])).toBe("inset 0 0 0 1px var(--app-border)");
      const stub = card.querySelector(".sw-stub");
      expect(stub, "the opened row renders its ledger").not.toBeNull();
      expect(cascaded(stub!, ["background", "background-color"])).toBe("transparent");
    }
  });
  it("keeps the Show details button inside a Saved card when the name is long", () => {
    // The summary holds the fact and the 44px disclosure, neither of which
    // can shrink. Only the name gives up room.
    expect(declaration(stylesheet, ".sw-card-summary", "flex")).toBe("none");
    expect(() => declaration(stylesheet, ".sw-card-summary", "min-width")).toThrow("Missing");
    expect(declaration(stylesheet, ".sw-brand", "min-width")).toBe("0");
    expect(declaration(stylesheet, ".sw-name", "text-overflow")).toBe("ellipsis");
    expect(declaration(stylesheet, ".sw-disclosure", "flex")).toBe("none");
    // Below 375px a place row gives its fact's room to the name (measured:
    // beside "Open till 3 PM" the name kept about 10 letters at 360px and
    // 12 at 375px). An event row keeps its date at every width.
    const narrow: string[] = [];
    stylesheet.walkRules('.sw-slot[id^="sw-slot-"] .sw-lipfact', (rule) => {
      const media = rule.parent?.type === "atrule" ? (rule.parent as postcss.AtRule).params : "";
      rule.walkDecls("display", (entry) => { narrow.push(`${media} ${entry.value}`); });
    });
    expect(narrow).toEqual(["(max-width: 374.98px) none"]);
    const eventFact = savedEventDeck(1, null).querySelector(".sw-lipfact");
    expect(eventFact).not.toBeNull();
    expect(eventFact!.matches('.sw-slot[id^="sw-slot-"] .sw-lipfact')).toBe(false);
  });
  it("uses the shared safe-area-aware horizontal gutter on the recovery heading, count, and list", () => {
    for (const selector of [".map-error-fallback-head", ".map-error-fallback .map-list"]) {
      const padding = declaration(stylesheet, selector, "padding");
      expect(padding).toContain("max(var(--app-space-4), env(safe-area-inset-right, 0px))");
      expect(padding).toContain("max(var(--app-space-4), env(safe-area-inset-left, 0px))");
    }
    expect(declaration(stylesheet, '.map-error-fallback .map-list > [aria-live="polite"]', "padding-inline")).toBe("0");
  });
  for (const mode of ["light", "dark"] as const) {
    const values = palette(mode === "dark");
    it(`${mode} actual photo-less event detail facts and links clear AA on the sheet surface`, () => {
      const template = document.createElement("template");
      template.innerHTML = renderToStaticMarkup(createElement(EventSheet, { event: detailEvent, onClose: () => {}, historyLayerId: "contrast-detail" }));
      const paragraphs = [...template.content.querySelectorAll<HTMLParagraphElement>("p")];
      const facts = paragraphs.filter((node) => ["Free", "Arts & culture"].includes(node.textContent!));
      expect(facts).toHaveLength(2);
      const links = [...template.content.querySelectorAll<HTMLAnchorElement>("a")].filter((node) => {
        const href = node.getAttribute("href");
        return href?.split("?")[0] === `/events/${detailEvent.slug}` || href === detailEvent.source_url;
      });
      expect(links).toHaveLength(2);
      for (const node of [...facts, ...links]) {
        expect(expressionContrast(values, node.style.color, node.style.background || "var(--app-bg-elevated-solid)"), node.textContent).toBeGreaterThanOrEqual(4.5);
      }
      const title = template.content.querySelector<HTMLHeadingElement>("header h2");
      expect(title?.textContent).toBe(detailEvent.title);
      expect(expressionContrast(values, title!.style.color, "var(--app-bg-elevated-solid)")).toBeGreaterThanOrEqual(4.5);
      expect(template.content.querySelector('[style*="linear-gradient(to bottom"]')).toBeNull();
    });
    for (const surface of ["--app-bg", "--app-bg-elevated-solid", "--app-bg-sunken"]) {
      it(`${mode} text, links, and actual status copy clear AA on ${surface}`, () => {
        for (const foreground of [
          "--app-ink", "--app-ink-2", "--app-ink-3", "--app-link", "--state-open", "--state-closing", "--app-danger-text", "--app-live-text",
          "--app-brand-text", "--app-cool-text", "--app-accent-text", "--app-forest-text",
        ]) {
          expect(contrast(values, foreground, surface), `${foreground} on ${surface}`).toBeGreaterThanOrEqual(4.5);
        }
        expect(contrast(values, "--app-control-border-safe", surface)).toBeGreaterThanOrEqual(3);
      });
    }
    it(`${mode} retains contrast on fixed Brick controls and Amber live badges`, () => {
      expect(contrast(values, "--app-on-brand", "--app-brand")).toBeGreaterThanOrEqual(4.5);
      expect(contrast(values, "--app-on-brand", "--app-brand-press")).toBeGreaterThanOrEqual(4.5);
      expect(contrast(values, "--app-media-ink", "--app-amber")).toBeGreaterThanOrEqual(4.5);
    });
  }
  it("has a secondary OS-dark ground while fixed media Ink and filled controls retain their colors", () => {
    const light = palette(false);
    const dark = palette(true);
    expect(resolveColor(light, "var(--app-bg)")).not.toEqual(resolveColor(dark, "var(--app-bg)"));
    for (const token of ["--app-media-ink", "--app-brand", "--app-brand-press", "--app-on-brand"]) {
      expect(resolveColor(light, `var(${token})`)).toEqual(resolveColor(dark, `var(${token})`));
    }
  });
  it("gives colored text its own role tokens: the fill color in light, a lifted foreground in dark", () => {
    const light = palette(false);
    const dark = palette(true);
    for (const [role, fill] of [
      ["--app-brand-text", "--app-brand"], ["--app-cool-text", "--app-cool"],
      ["--app-accent-text", "--app-accent"], ["--app-forest-text", "--app-brand-2"],
    ]) {
      expect(resolveColor(light, `var(${role})`), role).toEqual(resolveColor(light, `var(${fill})`));
      expect(resolveColor(dark, `var(${role})`), role).not.toEqual(resolveColor(dark, `var(${fill})`));
    }
    expect(resolveColor(dark, "var(--app-brand-text)")).toEqual(resolveColor(dark, "var(--app-link)"));
    expect(dark.get("--app-link")).toBe("#FFAAA0");
  });

  for (const mode of ["light", "dark"] as const) {
    const values = palette(mode === "dark");
    it(`${mode} the actual Weekend reason chip clears AA on an elevated event card`, () => {
      const event = {
        slug: "weekend-contrast", title: "Sample weekend event", category: "music", municipality: "frederick",
        starts_at: "2026-10-10T16:00:00.000Z", ends_at: "2026-10-10T18:00:00.000Z",
      } as EventWithMeta;
      const reasons = eventReasons(event, new Date("2026-10-08T12:00:00.000Z"));
      const template = document.createElement("template");
      template.innerHTML = renderToStaticMarkup(createElement(ReasonChipRow, { reasons }));
      const chip = [...template.content.querySelectorAll<HTMLSpanElement>("span[style]")].find((node) => node.textContent === "Weekend");
      expect(chip).toBeDefined();
      // Plain tool: a reason is plain text with no fill of its own, so its
      // label is measured against the card ground it sits on.
      expect(chip!.style.background).toBe("");
      expect(expressionContrast(values, chip!.style.color, "var(--app-bg-elevated-solid)")).toBeGreaterThanOrEqual(4.5);
    });
    it(`${mode} rendered Today fallback and Tonight actions clear AA on the page ground`, () => {
      for (const element of [
        createElement(TodayEventsRecoveryView, { response: null, failed: true }),
        createElement(TodayPlanTonightLink),
      ]) {
        const template = document.createElement("template");
        template.innerHTML = renderToStaticMarkup(element);
        const action = template.content.querySelector<HTMLAnchorElement>("a");
        expect(action).not.toBeNull();
        expect.soft(expressionContrast(values, action!.style.color, "var(--app-bg)"), action!.textContent).toBeGreaterThanOrEqual(4.5);
      }
    });
    it(`${mode} rendered County status text clears AA in selected and reported states`, async () => {
      for (const pathname of ["/today", "/pulse"]) {
        navigation.pathname = pathname;
        for (const summary of [
          { active: true, count: 2, tone: "alert", level: "Urgent" },
          { active: true, count: 2, tone: "caution", level: "Advisory" },
          { active: false, count: 0, tone: "quiet", level: "Clear" },
        ] satisfies Array<Pick<CountyStatusSummary, "active" | "count" | "tone" | "level">>) {
          const container = document.createElement("div");
          document.body.append(container);
          const root = createRoot(container);
          Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
          window.dispatchEvent(new Event("pageshow"));
          const frames = new Map<number, FrameRequestCallback>();
          let nextFrame = 0;
          vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { const id = ++nextFrame; frames.set(id, callback); return id; });
          vi.stubGlobal("cancelAnimationFrame", (id: number) => { frames.delete(id); });
          vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ...summary, ok: true, lastUpdated: new Date().toISOString(), validUntil: new Date(Date.now() + 360_000).toISOString() })));
          try {
            await act(async () => { root.render(createElement(PulseIndicator)); });
            const admitted = [...frames.values()]; frames.clear();
            await act(async () => { for (const callback of admitted) callback(performance.now()); });
            const indicator = container.querySelector<HTMLAnchorElement>("[data-pulse-indicator]");
            expect(indicator?.dataset.pulseState).toBe("ready");
            const background = indicator!.style.background || indicator!.className.match(/bg-\[([^\]]+)\]/)?.[1];
            expect(background, "painted County status ground").toBeDefined();
            expect.soft(expressionContrast(values, indicator!.style.color, background!), `${pathname} ${summary.level}`).toBeGreaterThanOrEqual(4.5);
          } finally {
            await act(async () => { root.unmount(); });
            container.remove();
            vi.unstubAllGlobals();
          }
        }
      }
    });
    it(`${mode} actual map and event stylesheet controls clear AA on their painted grounds`, () => {
      for (const [selector, fallbackBackground] of [
        [".map-peek-details-link", declaration(stylesheet, ".map-peek", "background")],
        [".eb-filter-reset", "var(--app-bg-elevated-solid)"],
        [".eb-lensseg button.on", declaration(stylesheet, ".eb-lensseg button.on", "background")],
        [".dock-opennow", declaration(stylesheet, ".dock-opennow", "background")],
        [".dock-essential-origin[data-on]", declaration(stylesheet, ".dock-essential-origin[data-on]", "background")],
        [".dock-essential-choice[data-on]", declaration(stylesheet, ".dock-essential-choice[data-on]", "background")],
        [".dock-essential-choice[data-on] .dock-essential-choice-icon", declaration(stylesheet, ".dock-essential-choice[data-on] .dock-essential-choice-icon", "background")],
        [".dock-scene[data-on] .dock-scene-icon", declaration(stylesheet, ".dock-scene-icon", "background")],
        ['.dock-scene[data-status="caution"] .dock-scene-copy small', declaration(stylesheet, ".dock-scene[data-on]", "background")],
        [".dock-discovery-eyebrow", "var(--app-bg-elevated-solid)"],
        [".dock-search-more", declaration(stylesheet, ".dock-search-more", "background")],
        [".dock-essentials-more:hover", declaration(stylesheet, ".dock-essentials-more", "background")],
        [".dock-contents[data-on]", "var(--app-bg-elevated-solid)"],
      ]) {
        expect.soft(expressionContrast(values, declaration(stylesheet, selector, "color"), fallbackBackground), selector).toBeGreaterThanOrEqual(4.5);
      }
      for (const selector of [".dock-opennow[data-on]", ".dock-findme", ".eb-filter-count"]) {
        expect(expressionContrast(values, declaration(stylesheet, selector, "color"), declaration(stylesheet, selector, "background")), selector).toBeGreaterThanOrEqual(4.5);
      }
    });
    it(`${mode} actual Today Find quiet controls and filled launcher retain contrast`, () => {
      for (const selector of [".shortcut", ".toolCaption small"]) {
        const ink = declaration(findStyles, selector, "color");
        expect(expressionContrast(values, ink, "var(--app-bg)"), selector).toBeGreaterThanOrEqual(4.5);
      }
      // Hover underlines the name. Each drawing uses its own ink and tinted background.
      const illustration = declaration(findStyles, ".wayfindingArt", "color");
      const ground = declaration(findStyles, ".wayfindingArt", "background");
      for (const selector of [".shortcut", ".shortcut:nth-child(1)", ".shortcut:nth-child(3)"]) {
        const card = new Map(values).set("--wayfinding-ink", declaration(findStyles, selector, "--wayfinding-ink"));
        expect(expressionContrast(card, illustration, ground), selector).toBeGreaterThanOrEqual(4.5);
      }
      const foreground = declaration(findStyles, ".launcher", "color");
      for (const selector of [".launcher", ".launcher:hover"]) {
        expect(expressionContrast(values, foreground, declaration(findStyles, selector, "background")), selector).toBeGreaterThanOrEqual(4.5);
      }
    });
    it(`${mode} rendered MapPeek status copy clears AA for open and closing places`, () => {
      for (const open_status of [
        { state: "open", closesAt: "20:00", closingSoon: false },
        { state: "closing-soon", closesAt: "20:00" },
      ] satisfies OpenStatus[]) {
        const place = {
          slug: "contrast-stop", name: "Contrast stop", category: "restaurant", municipality: "frederick",
          geom: { lat: 39.4, lng: -77.4 }, open_status,
        } as MapPinPlace;
        const markup = renderToStaticMarkup(createElement(MapPeek, {
          place, distanceOrigin: null, distanceOriginLabel: "from you", onClose: () => {}, onDetails: () => {},
        }));
        const rendered = document.createElement("template");
        rendered.innerHTML = markup;
        const status = rendered.content.querySelector<HTMLElement>(`[data-map-place-status="${open_status.state}"]`);
        expect(status, "rendered hours status").not.toBeNull();
        const foreground = status!.style.getPropertyValue("color");
        expect(foreground, "rendered status foreground").not.toBe("");
        expect(expressionContrast(values, foreground, declaration(stylesheet, ".map-peek", "background")), open_status.state).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
