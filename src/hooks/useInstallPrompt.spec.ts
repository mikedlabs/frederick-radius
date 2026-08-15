import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
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
  it("does not interrupt a first visit or shared-link session on any device", () => {
    expect(shouldAutoOfferInstall("visit")).toBe(false);
    expect(shouldAutoOfferInstall("social")).toBe(false);
  });

  it("automatically offers only after demonstrated value or a return visit", () => {
    expect(shouldAutoOfferInstall("value")).toBe(true);
    expect(shouldAutoOfferInstall("return")).toBe(true);
    expect(shouldAutoOfferInstall(null)).toBe(false);
  });

  it("keeps an earned automatic offer compact until instructions are requested", () => {
    const source = readFileSync("src/components/pwa/InstallPrompt.tsx", "utf8");

    expect(source).toContain('data-offer-mode={compactAutomatic ? "compact" : "instructions"}');
    expect(source).toContain("const compactAutomatic = !manual && !instructionsOpen");
    expect(source).toContain("How to add it");
    expect(source).toContain("{!compactAutomatic ? (");
    expect(source).toContain("data-install-prompt-footer");
  });
});
