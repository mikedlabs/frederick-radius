// @vitest-environment jsdom

import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import StaticMapPreview from "./StaticMapPreview";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("static map hydration recovery", () => {
  let root: Root | undefined;
  let container: HTMLDivElement;
  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
  });

  it.each([0, 640])("reconciles an image completed before hydration with naturalWidth %s", async (naturalWidth) => {
    const preview = <StaticMapPreview src="/api/event-map?test=1" alt="Event venue map" width={640} height={320} className="h-40" />;
    container = document.createElement("div");
    container.innerHTML = renderToString(preview);
    document.body.append(container);
    const image = container.querySelector("img")!;
    Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: naturalWidth } });
    await act(async () => { root = hydrateRoot(container, preview); });
    expect(image.hidden).toBe(naturalWidth === 0);
    expect(container.querySelector<HTMLElement>('[role="img"]')?.hidden).toBe(naturalWidth > 0);
  });
});
