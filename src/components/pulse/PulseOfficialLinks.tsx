import { ExternalLink } from "lucide-react";

const OFFICIAL_LINKS = {
  alerts: [
    ["Frederick weather alerts and forecast", "https://forecast.weather.gov/MapClick.php?lat=39.4143&lon=-77.4105"],
    ["City of Frederick alerts", "https://www.cityoffrederickmd.gov/AlertCenter.aspx"],
    ["County Health Department alerts", "https://health.frederickcountymd.gov/AlertCenter.aspx"],
  ],
  newsrooms: [
    ["City of Frederick news releases", "https://www.cityoffrederickmd.gov/CivicAlerts.aspx"],
    ["Frederick County news releases", "https://www.frederickcountymd.gov/CivicAlerts.aspx"],
  ],
  rivers: [
    ["Monocacy River gauge near Frederick", "https://water.noaa.gov/gauges/FDKM2"],
  ],
  roadwork: [
    ["City road closures and detours", "https://www.cityoffrederickmd.gov/1619/Traffic"],
    ["County road closures", "https://www.frederickcountymd.gov/5052/Roads-Closed"],
  ],
  power: [
    ["Potomac Edison outage map", "https://outages-mdwv.firstenergycorp.com/"],
  ],
  schools: [
    ["Frederick County Public Schools", "https://www.fcps.org/"],
  ],
} as const;

export default function PulseOfficialLinks({ topic }: { topic: keyof typeof OFFICIAL_LINKS }) {
  return (
    <ul className="min-w-0 divide-y divide-[var(--app-border)]">
      {OFFICIAL_LINKS[topic].map(([label, href]) => (
        <li key={href}>
          <a href={href} target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-sm px-1 text-[13px] font-semibold text-[var(--app-link)] underline underline-offset-4">
            {label}<ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
          </a>
        </li>
      ))}
    </ul>
  );
}
