import { getGaugeHistory } from "@/lib/integrations/usgsWater";
import type { GaugePeriod } from "@/lib/rivers/gaugeHistory";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const gauge = params.get("gauge") ?? "";
  const period = params.get("period");
  if (!/^\d{8,15}$/.test(gauge) || !["PT6H", "P1D", "P7D"].includes(period ?? "")) {
    return Response.json({ error: "Choose a USGS gauge and time range." }, { status: 400 });
  }
  try {
    return Response.json(await getGaugeHistory(gauge, period as GaugePeriod), {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
    });
  } catch {
    return Response.json({ error: "USGS history is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
