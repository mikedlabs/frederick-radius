const NWS = "https://api.weather.gov";
const UA = "Frederick Radius (miked@madproductions.io)";

export type NwsAlert = {
  id: string;
  event: string;
  headline: string;
  description: string;
  severity: "Minor" | "Moderate" | "Severe" | "Extreme" | "Unknown";
  urgency: "Past" | "Future" | "Expected" | "Immediate" | "Unknown";
  certainty: string;
  starts_at: string;
  ends_at: string;
  area: string;
  url: string;
};

type AlertsResp = {
  features?: Array<{
    properties: {
      id: string;
      event: string;
      headline: string;
      description: string;
      severity: NwsAlert["severity"];
      urgency: NwsAlert["urgency"];
      certainty: string;
      effective: string;
      expires: string;
      areaDesc: string;
      "@id": string;
    };
  }>;
};

export async function getNwsAlerts(): Promise<NwsAlert[]> {
  try {
    const res = await fetch(`${NWS}/alerts/active?area=MD`, {
      headers: { "User-Agent": UA, Accept: "application/geo+json" },
      next: { revalidate: 600 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as AlertsResp;
    const features = data.features ?? [];
    return features
      .filter((f) => /Frederick|Catoctin|Allegheny|All of Maryland/i.test(f.properties.areaDesc))
      .map((f) => ({
        id: f.properties.id,
        event: f.properties.event,
        headline: f.properties.headline,
        description: f.properties.description,
        severity: f.properties.severity,
        urgency: f.properties.urgency,
        certainty: f.properties.certainty,
        starts_at: f.properties.effective,
        ends_at: f.properties.expires,
        area: f.properties.areaDesc,
        url: f.properties["@id"],
      }));
  } catch {
    return [];
  }
}
