import type { Decorator, Preview } from "@storybook/nextjs-vite";
import { useEffect, type ReactNode } from "react";

import "../src/app/globals.css";
import "./preview.css";

/**
 * A fixed reference instant for story fixtures that render relative times,
 * open-state copy, or seasonal context. Stories should import this value
 * rather than calling new Date() while constructing fixture data.
 *
 * The preview does not replace the browser's Date constructor: Storybook,
 * animation libraries, and accessibility tooling all expect a real clock.
 */
export const RADIUS_STORY_NOW = new Date("2026-08-21T12:00:00-04:00");

const radiusViewports = {
  radiusMobileNarrow: {
    name: "Radius mobile narrow · 320 × 568",
    styles: { width: "320px", height: "568px" },
    type: "mobile",
  },
  radiusMobileCompact: {
    name: "Radius mobile compact · 375 × 667",
    styles: { width: "375px", height: "667px" },
    type: "mobile",
  },
  radiusMobile: {
    name: "Radius mobile · 390 × 844",
    styles: { width: "390px", height: "844px" },
    type: "mobile",
  },
  radiusMobileLarge: {
    name: "Radius mobile large · 430 × 932",
    styles: { width: "430px", height: "932px" },
    type: "mobile",
  },
  radiusTablet: {
    name: "Radius tablet · 768 × 1024",
    styles: { width: "768px", height: "1024px" },
    type: "tablet",
  },
  radiusDesktop: {
    name: "Radius desktop · 1440 × 900",
    styles: { width: "1440px", height: "900px" },
    type: "desktop",
  },
} as const;

type RadiusPreviewFrameProps = {
  children: ReactNode;
  motion: "full" | "reduce";
  season: "spring" | "summer" | "autumn" | "winter";
};

function RadiusPreviewFrame({
  children,
  motion,
  season,
}: RadiusPreviewFrameProps) {
  useEffect(() => {
    const root = document.documentElement;
    const previousMotion = root.dataset.storybookMotion;
    const previousSeason = root.dataset.season;

    root.dataset.storybookMotion = motion;
    root.dataset.season = season;

    return () => {
      if (previousMotion === undefined) {
        delete root.dataset.storybookMotion;
      } else {
        root.dataset.storybookMotion = previousMotion;
      }

      if (previousSeason === undefined) {
        delete root.dataset.season;
      } else {
        root.dataset.season = previousSeason;
      }
    };
  }, [motion, season]);

  return (
    <>
      <div
        id="app-root"
        data-radius-app-root
        data-reference-now={RADIUS_STORY_NOW.toISOString()}
      >
        {children}
      </div>
      {/* Reserved for components that target a stable overlay container.
          Existing body portals continue to work as they do in production. */}
      <div id="overlay-root" data-radius-overlay-root />
    </>
  );
}

const withRadiusPreview: Decorator = (Story, context) => (
  <RadiusPreviewFrame
    motion={(context.globals.motion as "full" | "reduce") ?? "full"}
    season={
      (context.globals.season as
        | "spring"
        | "summer"
        | "autumn"
        | "winter") ?? "summer"
    }
  >
    <Story />
  </RadiusPreviewFrame>
);

const preview: Preview = {
  decorators: [withRadiusPreview],
  globalTypes: {
    motion: {
      name: "Motion",
      description: "Preview the full interaction or reduced-motion state.",
      toolbar: {
        icon: "play",
        items: [
          { value: "full", title: "Full motion", icon: "play" },
          { value: "reduce", title: "Reduced motion", icon: "stop" },
        ],
        dynamicTitle: true,
      },
    },
    season: {
      name: "Season",
      description: "Preview the restrained seasonal token context.",
      toolbar: {
        icon: "calendar",
        items: [
          { value: "spring", title: "Spring" },
          { value: "summer", title: "Summer" },
          { value: "autumn", title: "Autumn" },
          { value: "winter", title: "Winter" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    motion: "full",
    season: "summer",
    backgrounds: { value: "radiusPaper" },
    viewport: { value: "radiusMobile", isRotated: false },
  },
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/today",
      },
    },
    backgrounds: {
      options: {
        radiusPaper: {
          name: "Radius Cream",
          value: "#F4EEE2",
        },
        radiusRaised: {
          name: "Radius raised paper",
          value: "#FBF8F0",
        },
        radiusInk: {
          name: "Radius Ink",
          value: "#221C15",
        },
      },
    },
    viewport: {
      options: radiusViewports,
    },
    controls: {
      expanded: true,
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      /** Fail Storybook's test runner on WCAG violations instead of merely
       * painting a warning badge that can be ignored. */
      test: "error",
    },
    radius: {
      referenceNow: RADIUS_STORY_NOW.toISOString(),
    },
  },
};

export default preview;
