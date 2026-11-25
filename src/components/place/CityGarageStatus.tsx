import { garageRateHeadline } from "@/data/parking-garages";

export default function CityGarageStatus() {
  return (
    <span className="inline-flex flex-col gap-0.5 text-sm" data-city-garage-status>
      <strong>Open 24 hours every day</strong>
      <span style={{ color: "var(--app-ink-2)" }}>{garageRateHeadline(new Date())}</span>
    </span>
  );
}
