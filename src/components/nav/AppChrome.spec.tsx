import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  FAIR_DAY_CANONICAL_PATH,
  FAIR_DAY_SHORT_PATH,
} from "@/lib/fair/route-policy";

const pathState = vi.hoisted(() => ({ pathname: "/today" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathState.pathname,
}));
vi.mock("./TopBar", () => ({
  default: () => <div data-shell-part="top-bar" />,
}));
vi.mock("./BottomNav", () => ({
  default: () => <div data-shell-part="bottom-nav" />,
}));
vi.mock("./SideRail", () => ({
  default: () => <div data-shell-part="side-rail" />,
}));

import AppChrome from "./AppChrome";

describe("AppChrome Fair isolation", () => {
  it.each([FAIR_DAY_SHORT_PATH, FAIR_DAY_CANONICAL_PATH])(
    "omits both global chrome regions on %s",
    (pathname) => {
      pathState.pathname = pathname;

      expect(renderToStaticMarkup(<AppChrome region="header" />)).toBe("");
      expect(renderToStaticMarkup(
        <AppChrome region="primary-navigation" />,
      )).toBe("");
    },
  );

  it("preserves the established shell everywhere else", () => {
    pathState.pathname = "/today";

    const header = renderToStaticMarkup(<AppChrome region="header" />);
    const navigation = renderToStaticMarkup(
      <AppChrome region="primary-navigation" />,
    );

    expect(header).toContain('data-shell-part="top-bar"');
    expect(navigation).toContain('data-shell-part="bottom-nav"');
    expect(navigation).toContain('data-shell-part="side-rail"');
  });
});
