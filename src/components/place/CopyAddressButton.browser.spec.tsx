// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CopyAddressButton from "./CopyAddressButton";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

describe("CopyAddressButton", () => {
  let container: HTMLDivElement;
  let root: Root;
  const writeText = vi.fn<(text: string) => Promise<void>>();

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    writeText.mockReset();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const button = () => container.querySelector("button") as HTMLButtonElement;

  it("copies the full address and says so", async () => {
    writeText.mockResolvedValue(undefined);
    await act(async () =>
      root.render(<CopyAddressButton address="4 E Patrick St, Frederick, MD 21701" placeName="Cafe Nola" />),
    );
    expect(button().textContent).toBe("Copy");
    expect(button().getAttribute("aria-label")).toBe("Copy the address of Cafe Nola");

    await act(async () => button().click());

    expect(writeText).toHaveBeenCalledWith("4 E Patrick St, Frederick, MD 21701");
    expect(button().textContent).toBe("Copied");
    expect(container.querySelector("[aria-live]")?.textContent).toBe("Address copied.");
  });

  it("does not claim a copy the browser refused", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    await act(async () =>
      root.render(<CopyAddressButton address="4 E Patrick St" placeName="Cafe Nola" />),
    );
    await act(async () => button().click());

    expect(button().textContent).toBe("Copy failed");
    expect(container.querySelector("[aria-live]")?.textContent).toBe(
      "The address could not be copied.",
    );
  });
});
