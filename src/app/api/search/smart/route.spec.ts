import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const handleRequest: (request: Request) => Promise<Response> = GET;

const provider = vi.hoisted(() => ({
  generateObject: vi.fn(),
  openai: vi.fn(),
}));
vi.mock("ai", () => ({ generateObject: provider.generateObject }));
vi.mock("@ai-sdk/openai", () => ({ openai: provider.openai }));

describe("retired smart search boundary", () => {
  it.each([
    { name: "missing", query: "" },
    { name: "ordinary", query: "coffee in Brunswick" },
    { name: "oversized", query: "x".repeat(32_000) },
  ])(
    "never invokes an AI provider for a $name query",
    async ({ query }) => {
      const request = new Request(`https://radius.test/api/search/smart?q=${encodeURIComponent(query)}`);
      const response = await handleRequest(request);
      expect(response.status).toBe(410);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.json()).toEqual({
        error: "retired", searchPath: "/api/search", askPath: "/ask",
      });
      expect(provider.openai).not.toHaveBeenCalled();
      expect(provider.generateObject).not.toHaveBeenCalled();
    },
  );
});
