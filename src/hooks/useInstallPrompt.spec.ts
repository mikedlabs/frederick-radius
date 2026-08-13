import { describe, expect, it, vi } from "vitest";
import {
  FIRST_VISIT_INSTALL_DELAY_MS,
  requestBrowserInstall,
  shouldAutoOfferInstall,
} from "./useInstallPrompt";

describe("requestBrowserInstall", () => {
  it("opens the browser-owned install dialog and returns acceptance", async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);

    await expect(
      requestBrowserInstall({
        prompt,
        userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
      }),
    ).resolves.toBe("accepted");
    expect(prompt).toHaveBeenCalledOnce();
  });

  it("reports a browser dismissal without pretending installation succeeded", async () => {
    await expect(
      requestBrowserInstall({
        prompt: vi.fn().mockResolvedValue(undefined),
        userChoice: Promise.resolve({ outcome: "dismissed", platform: "web" }),
      }),
    ).resolves.toBe("dismissed");
  });
});

describe("automatic Home Screen invitation", () => {
  const iphone =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
  const android =
    "Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36";

  it("waits ten seconds before the first mobile invitation", () => {
    expect(FIRST_VISIT_INSTALL_DELAY_MS).toBe(10_000);
  });

  it("automatically invites phones but leaves desktop behind the manual door", () => {
    expect(shouldAutoOfferInstall("visit", iphone)).toBe(true);
    expect(shouldAutoOfferInstall("visit", android)).toBe(true);
    expect(
      shouldAutoOfferInstall(
        "visit",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)",
      ),
    ).toBe(false);
  });

  it("keeps higher-intent value and return invitations available", () => {
    expect(shouldAutoOfferInstall("value", "desktop")).toBe(true);
    expect(shouldAutoOfferInstall("return", "desktop")).toBe(true);
    expect(shouldAutoOfferInstall(null, iphone)).toBe(false);
  });
});
