import { BRAND } from "./brand";

/**
 * Brand values consumed by browser/PWA/social surfaces that cannot resolve
 * CSS custom properties. The version makes immutable icon URLs refresh when
 * the generated artwork changes.
 */
// Bump whenever the generated icon artwork changes. Launchers cache icon URLs
// aggressively, so this is the deliberate cache boundary for a corrected mark.
const ICON_VERSION = "20260723a";
const versioned = (path: string) => `${path}?v=${ICON_VERSION}`;
const taglineTitle = BRAND.tagline.replace(/\.$/, "");

export const PLATFORM_BRAND = {
  name: BRAND.name,
  shortName: "Radius",
  title: `${BRAND.name}: ${taglineTitle}`,
  description:
    "Frederick Radius provides current places, events, live conditions, and practical information across Frederick County, Maryland.",
  themeColor: BRAND.colors.cream,
  iconVersion: ICON_VERSION,
  icons: {
    anySvg: versioned("/icons/icon.svg"),
    maskableSvg: versioned("/icons/icon-maskable.svg"),
    any192: versioned("/icons/icon-192.png"),
    any512: versioned("/icons/icon-512.png"),
    maskable512: versioned("/icons/icon-maskable-512.png"),
    apple180: versioned("/apple-icon.png"),
    push: versioned("/icons/icon-192.png"),
    badge: versioned("/icons/badge-72.png"),
  },
} as const;
