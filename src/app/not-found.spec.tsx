// @vitest-environment jsdom
import { act, type AnchorHTMLAttributes } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const find = vi.hoisted(() => ({ requestFind: vi.fn() }));
vi.mock("@/lib/findBridge", () => find);
vi.mock("next/link", () => ({
  default: ({ prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => {
    void prefetch;
    return <a {...props} />;
  },
}));

import NotFound from "./not-found";
import { appFindIsMounted } from "@/components/nav/NotFoundFindButton";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("global 404", () => {
  it("adds no second main landmark inside the app shell", () => {
    const markup = renderToStaticMarkup(<NotFound />);
    expect(markup).not.toContain("<main");
    expect(markup).not.toContain('id="main-content"');
  });

  it("sits on the Cream canvas without the old cool and plum wash", () => {
    const markup = renderToStaticMarkup(<NotFound />);
    expect(markup).not.toMatch(/gradient/);
    expect(markup).not.toContain("--app-accent");
    expect(markup).not.toContain("--app-cool");
  });

  it("offers one primary search and one text link to Today, with nothing autofocused", () => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(<NotFound />);

    expect(host.querySelector("h1")?.textContent).toBe("That page isn't here.");
    const links = [...host.querySelectorAll("a")];
    expect(links.map((link) => [link.textContent?.trim(), link.getAttribute("href")])).toEqual([
      ["Search Frederick Radius", "/search"],
      ["Go to Today", "/today"],
    ]);
    expect(host.querySelectorAll("input, [autofocus]")).toHaveLength(0);
    expect(host.querySelectorAll("button")).toHaveLength(0);
  });
});

describe("404 search action", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    find.requestFind.mockReset();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    document.querySelector("[data-app-topbar]")?.remove();
  });

  function click(target: Element, init: MouseEventInit = {}) {
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
    target.dispatchEvent(event);
    return event;
  }

  it("opens the header's one Find overlay when the app shell is present", async () => {
    const header = document.createElement("header");
    header.setAttribute("data-app-topbar", "");
    document.body.prepend(header);
    expect(appFindIsMounted(document)).toBe(true);
    await act(async () => root.render(<NotFound />));

    const search = [...host.querySelectorAll("a")].find((link) => link.textContent?.includes("Search Frederick Radius"))!;
    const event = click(search);

    expect(event.defaultPrevented).toBe(true);
    expect(find.requestFind).toHaveBeenCalledWith("global");
    expect(document.activeElement).not.toBeInstanceOf(HTMLInputElement);
  });

  it("stays an ordinary link to the search page without the app shell or on a modified click", async () => {
    expect(appFindIsMounted(document)).toBe(false);
    await act(async () => root.render(<NotFound />));
    const search = [...host.querySelectorAll("a")].find((link) => link.textContent?.includes("Search Frederick Radius"))!;
    search.addEventListener("click", (event) => event.preventDefault(), { once: false });

    click(search);
    expect(find.requestFind).not.toHaveBeenCalled();

    const header = document.createElement("header");
    header.setAttribute("data-app-topbar", "");
    document.body.prepend(header);
    click(search, { metaKey: true });
    expect(find.requestFind).not.toHaveBeenCalled();
  });
});
