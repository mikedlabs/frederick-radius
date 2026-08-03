import { describe, expect, it } from "vitest";
import {
  UPDATE_PROMPT_DURATION_MS,
  updatePromptPresentation,
} from "./ServiceWorkerRegister";

describe("service-worker update prompt presentation", () => {
  it("moves the prompt away from the map's bottom controls", () => {
    expect(updatePromptPresentation("/map")).toEqual({
      duration: UPDATE_PROMPT_DURATION_MS,
      position: "top-center",
    });
  });

  it("keeps the standard app placement and always expires", () => {
    const presentation = updatePromptPresentation("/today");

    expect(presentation.position).toBe("bottom-center");
    expect(Number.isFinite(presentation.duration)).toBe(true);
    expect(presentation.duration).toBeGreaterThanOrEqual(8_000);
  });
});
