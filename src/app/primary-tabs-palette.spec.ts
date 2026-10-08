// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import postcss from "postcss";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import MapPeek from "@/components/map/MapPeek";
import PulseIndicator from "@/components/nav/PulseIndicator";
import TodayPlanTonightLink from "@/components/today/TodayPlanTonightLink";
import { TodayEventsRecoveryView } from "@/components/today/TodayEventsRecovery";
import { ReasonChipRow } from "@/components/ui/ReasonChip";
import { eventReasons } from "@/lib/event-reasons";
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
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const stylesheet = postcss.parse(readFileSync("src/app/globals.css", "utf8"));
const findStyles = postcss.parse(readFileSync("src/components/today/TodayAsk.module.css", "utf8"));
type RGB = [number, number, number];

function palette(dark: boolean): Map<string, string> {
  const values = new Map<string, string>();
  stylesheet.walkRules(":root", (rule) => {
    const media = rule.parent?.type === "atrule" ? rule.parent.params : null;
    if (media !== null && (!dark || media !== "(prefers-color-scheme: dark)")) return;
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

describe("primary tab palette contrast", () => {
  for (const mode of ["light", "dark"] as const) {
    const values = palette(mode === "dark");
    for (const surface of ["--app-bg", "--app-bg-elevated-solid", "--app-bg-sunken"]) {
      it(`${mode} text, links, and actual status copy clear AA on ${surface}`, () => {
        for (const foreground of ["--app-ink", "--app-ink-2", "--app-ink-3", "--app-link", "--state-open", "--state-closing", "--app-danger-text", "--app-live-text"]) {
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
      expect(expressionContrast(values, chip!.style.color, chip!.style.background, "var(--app-bg-elevated-solid)")).toBeGreaterThanOrEqual(4.5);
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
          vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ...summary, ok: true, lastUpdated: new Date().toISOString() })));
          try {
            await act(async () => { root.render(createElement(PulseIndicator)); });
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
      for (const selector of [".shortcut:hover", ".shortcut svg"]) {
        expect(expressionContrast(values, declaration(findStyles, selector, "color"), declaration(findStyles, selector, "background")), selector).toBeGreaterThanOrEqual(4.5);
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
        const foreground = markup.match(/class="map-peek-meta"><span style="color:([^;]+);/);
        expect(foreground, "rendered hours status").not.toBeNull();
        expect(expressionContrast(values, foreground![1], declaration(stylesheet, ".map-peek", "background")), open_status.state).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
