import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPageSnapshot } from "../scripts/lib/extract-agent";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchPageSnapshot", () => {
  it("returns clean text and anchors resolved against the final redirect URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        url: "https://www.example.com/home",
        text: async () => `
          <html>
            <body>
              <script>ignore me</script>
              <h1>Example Kitchen</h1>
              <a href="/menu">Menu</a>
            </body>
          </html>
        `,
      })),
    );

    await expect(
      fetchPageSnapshot("http://example.com", { maxChars: 100 }),
    ).resolves.toEqual({
      text: "Example Kitchen Menu",
      links: [{ url: "https://www.example.com/menu", text: "Menu" }],
      finalUrl: "https://www.example.com/home",
    });
  });
});
