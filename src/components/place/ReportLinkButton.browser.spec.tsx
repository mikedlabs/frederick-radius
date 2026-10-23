// @vitest-environment jsdom
import { act } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommerceLink } from "@/lib/commerce/types";
import ReportLinkButton from "./ReportLinkButton";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const links: CommerceLink[] = [
  { provider: "website", type: "menu", url: "https://example.org/menu", source: "imported" },
  { provider: "website", type: "order", url: "https://example.org/order", source: "imported" },
];

describe("Report link hydration readiness", () => {
  let host: HTMLDivElement;
  let root: Root | undefined;
  let fetchStub: ReturnType<typeof vi.fn>;
  const preview = () => <ReportLinkButton placeSlug="readiness-fixture" placeName="Fixture restaurant" links={links} />;
  const button = (name: string) => {
    const match = [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent?.trim() === name);
    expect(match, `Expected the ${name} button`).toBeDefined();
    return match!;
  };

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    fetchStub = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchStub);
  });

  afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    root = undefined;
    host.remove();
    vi.unstubAllGlobals();
  });

  it("disables the server preview, then opens and cancels from the first enabled hydrated click", async () => {
    host.innerHTML = renderToString(preview());
    const opener = button("Report a broken link");
    const nativeClick = vi.fn();
    host.addEventListener("click", nativeClick);
    expect(opener.disabled).toBe(true);
    expect(opener.dataset.reportInteractionReady).toBe("false");
    opener.click();
    expect(nativeClick).not.toHaveBeenCalled();
    expect(host.querySelector("select, textarea")).toBeNull();
    expect(fetchStub).not.toHaveBeenCalled();

    const recoverableErrors: unknown[] = [];
    await act(async () => { root = hydrateRoot(host, preview(), { onRecoverableError: error => recoverableErrors.push(error) }); });
    const ready = button("Report a broken link");
    expect(ready.disabled).toBe(false);
    expect(ready.dataset.reportInteractionReady).toBe("true");
    await act(async () => ready.click());
    expect(host.querySelectorAll("select option")).toHaveLength(2);
    expect(host.querySelector('textarea[aria-label="What is broken about this link?"]')).not.toBeNull();
    await act(async () => button("Cancel").click());
    expect(host.querySelector("select, textarea")).toBeNull();
    expect(button("Report a broken link").disabled).toBe(false);
    expect(recoverableErrors).toEqual([]);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("keeps a client-mounted opener usable immediately and never submits on open or cancel", async () => {
    root = createRoot(host);
    await act(async () => root!.render(preview()));
    const opener = button("Report a broken link");
    expect(opener.disabled).toBe(false);
    expect(opener.dataset.reportInteractionReady).toBe("true");
    await act(async () => opener.click());
    expect(host.querySelector("select")).not.toBeNull();
    await act(async () => button("Cancel").click());
    expect(host.querySelector("select, textarea")).toBeNull();
    expect(fetchStub).not.toHaveBeenCalled();
  });
});
