import { beforeEach, describe, expect, it, vi } from "vitest";
import { getGaugeHistory } from "@/lib/integrations/usgsWater";
import { GET } from "./route";
vi.mock("@/lib/integrations/usgsWater", () => ({ getGaugeHistory: vi.fn() }));
const get = (query: string) => GET(new Request("https://frederickradius.app/api/rivers/history?" + query));
beforeEach(() => vi.mocked(getGaugeHistory).mockReset());
describe("river history public range", () => {
  it("rejects invalid station IDs and unbounded time ranges before any USGS read", async () => {
    for (const q of ["gauge=x&period=P7D", "gauge=01643000&period=P1Y", "gauge=01643000"]) expect((await get(q)).status).toBe(400);
    expect(getGaugeHistory).not.toHaveBeenCalled();
  });
  it("keeps a verified empty range distinct from service failure", async () => {
    vi.mocked(getGaugeHistory).mockResolvedValueOnce({ end: "2026-11-24T12:00:00Z", flow: [], height: [] }).mockRejectedValueOnce(new Error("timeout"));
    const ok = await get("gauge=01643000&period=P7D");
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ flow: [], height: [] });
    const failed = await get("gauge=01643000&period=P7D");
    expect(failed.status).toBe(503);
    expect(failed.headers.get("cache-control")).toBe("no-store");
  });
});
