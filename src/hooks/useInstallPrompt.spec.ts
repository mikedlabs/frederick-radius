import { describe, expect, it, vi } from "vitest";
import { requestBrowserInstall } from "./useInstallPrompt";

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
