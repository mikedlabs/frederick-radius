import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import TodayWeatherView, { WeatherUnavailable } from "./TodayWeatherView";
import BottomNav from "@/components/nav/BottomNav";

const meta = {
  title: "Today/Weather reading",
  component: TodayWeatherView,
  parameters: { layout: "centered", nextjs: { appDirectory: true } },
  decorators: [(Story, { parameters }) => (
    <div data-app-primary-tab="/today" className="w-[min(38rem,calc(100vw-32px))]"
      style={parameters.radiusWeatherPhoneFrame ? { margin: 16 } : undefined}>
      <Story />
    </div>
  )],
  args: {
    headline: "It is clear and comfortable.",
    condition: "Mostly sunny",
    temperatureF: 72,
    highF: 76,
    sun: { label: "Sunset", time: "6:42 PM" },
    variant: "Sun",
    forecastAvailable: true,
    issuedAt: "2026-10-08T11:35:00.000Z",
    safetyNote: null,
    daylight: <span> · 5h 40m of daylight left</span>,
  },
} satisfies Meta<typeof TodayWeatherView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HealthyForecast: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Mostly sunny")).toBeVisible();
    await expect(canvas.getByText("72 degrees Fahrenheit forecast")).toBeVisible();
    await expect(canvas.getByText("NWS forecast · Frederick")).toBeVisible();
    await expect(canvas.getByText(/^Oct 8, 2026(?:,| at) 7:35 AM EDT$/)).toHaveAttribute("datetime", "2026-10-08T11:35:00.000Z");
    await expect(canvas.getByText("High 76°")).toBeVisible();
    await expect(canvas.getByText("5h 40m of daylight left", { exact: false })).toBeVisible();
  },
};

export const MastheadReading: Story = {
  args: { density: "masthead", headline: "Mostly sunny", safetyNote: "The air-quality reading is unavailable." },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const fact of ["Mostly sunny", "Frederick · NWS", "The air-quality reading is unavailable."]) {
      await expect(canvas.getByText(fact)).toBeVisible();
    }
    await expect(canvas.getByText("High 76°")).not.toBeVisible();
    const summary = canvasElement.querySelector<HTMLElement>("summary[data-today-weather-summary]")!;
    const forecast = canvasElement.querySelector<HTMLAnchorElement>('a[href="/pulse?open=weather"]')!;
    await expect(summary).toHaveAccessibleName(/Forecast details for Frederick.*72 degrees Fahrenheit forecast/);
    await expect(forecast).not.toBeVisible();
    await userEvent.click(summary);
    await expect(forecast).toBeVisible();
    await expect(canvas.getByText("High 76°")).toBeVisible();
    await expect(canvas.getByText("NWS forecast · Frederick")).toBeVisible();
    await expect(canvas.getByText(/^Oct 8, 2026(?:,| at) 7:35 AM EDT$/)).toHaveAttribute("datetime", "2026-10-08T11:35:00.000Z");
    await expect(canvas.getByText("5h 40m of daylight left", { exact: false })).toBeVisible();
    await expect(canvasElement.querySelector("[data-weather-density]")).toHaveAttribute("data-weather-density", "masthead");
    await userEvent.click(summary);
    await expect(forecast).not.toBeVisible();
    await expect(canvas.getByText("The air-quality reading is unavailable.")).toBeVisible();
  },
};

export const PartialSafetyFeed: Story = {
  args: { headline: "Mostly sunny", safetyNote: "The weather-alert feed is unavailable." },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Mostly sunny" })).toBeVisible();
    await expect(canvas.getByText("The weather-alert feed is unavailable.")).toBeVisible();
    await expect(canvas.queryByText("It is clear and comfortable.")).not.toBeInTheDocument();
  },
};

export const MissingIssueTime: Story = {
  args: { issuedAt: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Issue time unavailable")).toBeVisible();
    await expect(canvasElement.querySelector("time")).toBeNull();
  },
};

export const OlderIssuedForecast: Story = {
  args: { issuedAt: "2026-10-07T11:35:00.000Z" },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/^Oct 7, 2026(?:,| at) 7:35 AM EDT$/)).toBeVisible();
  },
};

export const ForecastUnavailable: Story = {
  render: () => <WeatherUnavailable />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("region", { name: "Weather unavailable" })).toBeVisible();
    await expect(canvas.getByText("County status")).toBeVisible();
    await expect(canvas.queryByText("72 degrees Fahrenheit forecast")).not.toBeInTheDocument();
  },
};

export const ActiveWarningWithoutForecast: Story = {
  args: {
    headline: "Flash Flood Warning is active.", condition: "", temperatureF: null,
    highF: null, sun: null, variant: null, forecastAvailable: false, issuedAt: null,
    daylight: undefined,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Flash Flood Warning is active." })).toBeVisible();
    await expect(canvas.getByText("The NWS forecast is briefly unavailable.")).toBeVisible();
    await expect(canvas.queryByText("72 degrees Fahrenheit forecast")).not.toBeInTheDocument();
  },
};

export const UnhealthyAir: Story = {
  args: { headline: "The air is unhealthy right now." },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "The air is unhealthy right now." })).toBeVisible();
    await expect(canvas.getByText("Mostly sunny")).toBeVisible();
  },
};

export const NarrowLongCondition: Story = {
  args: {
    headline: "Chance showers and thunderstorms",
    condition: "Chance showers and thunderstorms",
    temperatureF: 68, variant: "CloudLightning",
    safetyNote: "Weather-alert and air-quality checks are unavailable.",
  },
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Chance showers and thunderstorms" })).toBeVisible();
    await expect(canvas.getByText("Weather-alert and air-quality checks are unavailable.")).toBeVisible();
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
  },
};

async function exerciseNarrowMasthead({ canvasElement }: Parameters<NonNullable<Story["play"]>>[0]) {
    const canvas = within(canvasElement);
    const summary = canvasElement.querySelector<HTMLElement>("summary[data-today-weather-summary]")!;
    const warning = canvas.getByRole("heading", { name: "Flash Flood Warning is active." });
    const safety = canvas.getByText("Weather-alert and air-quality checks are unavailable.");
    const document = canvasElement.ownerDocument;
    const view = document.defaultView!;
    const root = document.documentElement;
    const origin = view.location.href;
    const previousViewport = { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
    // Native provider actions only exist in the opt-in Vitest browser gate.
    // Keep ordinary interactive Storybook free of the Vitest-only module.
    const inBrowserGate = Boolean((globalThis as typeof globalThis & { __vitest_browser__?: boolean }).__vitest_browser__);
    const browser = inBrowserGate ? await import("vitest/browser") : null;
    const forecast = canvasElement.querySelector<HTMLAnchorElement>('a[href="/pulse?open=weather"]')!;
    const details = summary.closest("details")!;
    const physicalTarget = async (element: HTMLElement) => waitFor(async () => {
      // Resample physical bounds while the browser's native focus scroll
      // settles; never move or pre-focus the target to manufacture a hit.
      const box = element.getBoundingClientRect();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      const hits = [[x,y],[x-21.5,y],[x+21.5,y],[x,y-21.5],[x,y+21.5]].map(([px,py]) => {
        const hit = document.elementFromPoint(px,py);
        return px >= 0 && py >= 0 && px < view.innerWidth && py < view.innerHeight &&
          (hit === element || (hit !== null && element.contains(hit)));
      });
      await expect(box.width).toBeGreaterThanOrEqual(44);
      await expect(box.height).toBeGreaterThanOrEqual(44);
      await expect(box.left).toBeGreaterThanOrEqual(0);
      await expect(box.right).toBeLessThanOrEqual(view.innerWidth);
      if (canvasElement.querySelector("[data-bottom-nav-shell]") && hits.some((hit) => !hit)) {
        const nav = canvasElement.querySelector('[aria-label="Primary"]')!.getBoundingClientRect();
        console.info("Weather navigation hit diagnostic", JSON.stringify({
          tag: element.tagName, focused: document.activeElement === element,
          rect: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
          scrollY: view.scrollY, viewportHeight: view.innerHeight, navTop: nav.top, hits,
          owners: [[x,y],[x-21.5,y],[x+21.5,y],[x,y-21.5],[x,y+21.5]].map(([px,py]) => {
            const hit = document.elementFromPoint(px,py);
            return hit ? { tag: hit.tagName, primaryNav: Boolean(hit.closest('[aria-label="Primary"]')) } : null;
          }),
        }));
      }
      await expect(hits, "center and four physical44px cardinal samples hit the focused control").toEqual([true,true,true,true,true]);
      const focused = getComputedStyle(element);
      await expect(focused.outlineStyle).not.toBe("none");
      await expect(parseFloat(focused.outlineWidth)).toBeGreaterThanOrEqual(2);
    });
    let nativeTabPresses = 0;
    const previousSize = root.style.getPropertyValue("font-size");
    const previousPriority = root.style.getPropertyPriority("font-size");
    const probes = [
      summary.querySelector<HTMLElement>("[data-weather-temperature]")!,
      summary.querySelector<HTMLElement>("[data-weather-condition]")!,
      summary.querySelector<HTMLElement>("[data-weather-scope]")!,
      summary.querySelector<HTMLElement>("[data-weather-disclosure-cue]")!,
      canvasElement.querySelector<HTMLElement>("[data-weather-source]")!,
      canvasElement.querySelector<HTMLElement>("[data-weather-issuance]")!,
      canvasElement.querySelector<HTMLElement>("[data-weather-stats]")!,
      canvasElement.querySelector<HTMLElement>('a[href="/pulse?open=weather"]')!,
      warning, safety,
    ];
    try {
      if (browser) {
        await browser.page.viewport(320, 568);
        // A scrolling desktop WebKit canvas may reserve a scrollbar gutter.
        // The native viewport is still320px; physical hit/overflow probes below
        // continue to inspect the actual laid-out control and document.
        await waitFor(() => expect(view.innerWidth).toBe(320));
        await waitFor(() => expect(view.innerHeight).toBe(568));
        // A fresh canvas must begin at ordinary document focus. Fail instead
        // of repairing a stale focused node with focus(), blur() or a click.
        await expect([document.body, document.documentElement], "native keyboard starts from a fresh document, without target pre-focus").toContain(document.activeElement);
        await expect(summary).not.toHaveFocus();
      }
      await document.fonts.ready;
      root.style.setProperty("font-size", "100%");
      const normalSizes = probes.map((element) => parseFloat(getComputedStyle(element).fontSize));
      root.style.setProperty("font-size", "200%");
      for (let index = 0; index < probes.length; index += 1) {
        const doubledSize = parseFloat(getComputedStyle(probes[index]).fontSize);
        await expect(normalSizes[index]).toBeGreaterThan(0);
        await expect(doubledSize / normalSizes[index]).toBeCloseTo(2, 2);
      }
      await expect(summary.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
      await expect(summary.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
      await expect(summary.querySelector("div, a, button, input, select")).toBeNull();
      await expect(summary.querySelector(".sky-glyph")?.tagName).toBe("SPAN");
      await expect(warning).toBeVisible();
      await expect(safety).toBeVisible();
      await expect(details).not.toHaveAttribute("open");
      await expect(forecast).not.toBeVisible();
      if (browser) {
        const { userEvent: nativeUserEvent } = browser;
        while (document.activeElement !== summary && nativeTabPresses < 40) {
          await nativeUserEvent.keyboard("{Tab}");
          nativeTabPresses += 1;
        }
        await expect(nativeTabPresses, "at least one ordinary Tab reaches the available forecast").toBeGreaterThan(0);
        await expect(summary, "summary is reached within40 native Tab presses").toHaveFocus();
        await physicalTarget(summary);
        await nativeUserEvent.keyboard("{Enter}");
      } else {
        // Synthetic workshop clicks exercise the fixture's source/safety
        // presentation only. They are not native keyboard acceptance.
        await userEvent.click(summary);
      }
      await expect(details).toHaveAttribute("open", "");
      await expect(canvas.getByText("High 76°")).toBeVisible();
      await expect(canvas.getByText("NWS forecast · Frederick")).toBeVisible();
      await expect(canvas.getByText(/^Oct 8, 2026(?:,| at) 7:35 AM EDT$/)).toHaveAttribute("datetime", "2026-10-08T11:35:00.000Z");
      await expect(forecast).toBeVisible();
      await expect(forecast).toHaveAttribute("href", "/pulse?open=weather");
      if (browser) {
        const { userEvent: nativeUserEvent } = browser;
        await nativeUserEvent.keyboard("{Tab}");
        await expect(forecast).toHaveFocus();
        await physicalTarget(forecast);
        await nativeUserEvent.keyboard("{Shift>}{Tab}{/Shift}");
        await expect(summary).toHaveFocus();
        await nativeUserEvent.keyboard("{Enter}");
        await expect(summary).toHaveFocus();
        await physicalTarget(summary);
      } else {
        await userEvent.click(summary);
      }
      await expect(details).not.toHaveAttribute("open");
      await expect(forecast).not.toBeVisible();
      await expect(warning).toBeVisible();
      await expect(safety).toBeVisible();
      await expect(warning.closest("details")).toBeNull();
      await expect(safety.closest("details")).toBeNull();
      await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(canvasElement.clientWidth);
      await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(view.innerWidth + 1);
      await expect(view.location.href, "summary actions never activate the real forecast route").toBe(origin);
      if (browser) console.info("Today available-weather fixture native keyboard acceptance", JSON.stringify({
        fixtureProvidedForecast: true, liveNwsAvailabilityProven: false, nativeKeyboard: true,
        viewport: { width: view.innerWidth, height: view.innerHeight },
        rootFont: getComputedStyle(root).fontSize, nativeTabPresses,
        sourceIssuedAt: "2026-10-08T11:35:00.000Z", hitSamplesPerControl: 5,
      }));
    } finally {
      if (previousSize) root.style.setProperty("font-size", previousSize, previousPriority);
      else root.style.removeProperty("font-size");
      if (browser) {
        try { await browser.userEvent.cleanup(); }
        finally { await browser.page.viewport(previousViewport.width, previousViewport.height); }
      }
    }
}

/** The real compact summary must reflow without hiding warning/feed context. */
export const NarrowMastheadWarning: Story = {
  args: {
    density: "masthead", headline: "Flash Flood Warning is active.",
    condition: "Chance showers and thunderstorms", temperatureF: 68,
    variant: "CloudLightning", safetyNote: "Weather-alert and air-quality checks are unavailable.",
  },
  // The native browser gate resizes its real iframe. Avoid Storybook's
  // centered rem padding so this fixture keeps the app's physical16px inset.
  parameters: {
    layout: "fullscreen", radiusWeatherPhoneFrame: true,
    docs: { description: { story: "Available-forecast fixture with a long warning and unavailable safety feed. Native Vitest keyboard checks use actual compiled CSS at doubled root text. This is not live NWS, full-page zoom or VoiceOver proof." } },
  },
  globals: { viewport: { value: "radiusMobileNarrow", isRotated: false } },
  play: (context) => exerciseNarrowMasthead(context),
};

/** Real navigation can cover a focused control even when its DOM is visible.
 * This fixture reproduces the warning-led page at doubled compact text. */
export const NarrowMastheadWithNavigation: Story = {
  args: NarrowMastheadWarning.args,
  parameters: NarrowMastheadWarning.parameters,
  globals: NarrowMastheadWarning.globals,
  play: (context) => exerciseNarrowMasthead(context),
  decorators: [(Story) => (
    <>
      <aside aria-label="Fixture safety alert" className="my-8 rounded-lg p-4 text-[13px]">
        Heads up: Freeze Warning. Until 6:15 AM Sunday.
      </aside>
      <h1 className="text-[32px] font-bold leading-tight">Late tonight</h1>
      <p className="mb-5 mt-2 text-[13px]">Saturday, October 17</p>
      <Story />
      <section className="mt-6 pb-40">
        <h2 className="text-[20px] font-semibold">Find something useful</h2>
        <p className="text-[14px]">Find places, events, services and local information.</p>
      </section>
      <BottomNav />
    </>
  )],
};
