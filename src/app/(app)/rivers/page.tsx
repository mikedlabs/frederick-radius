import type { Metadata } from "next";
import Link from "next/link";
import RiverGaugeExplorer from "@/components/rivers/RiverGaugeExplorer";
import styles from "@/components/rivers/RiverGaugeExplorer.module.css";
import { getFrederickWaterSitesWithHistoryResult } from "@/lib/integrations/usgsWater";
import { currentFloodCoverage } from "@/lib/integrations/floodStage";
import { riverCoverageSummary } from "@/lib/rivers/gaugeHistory";

export const metadata: Metadata = {
  alternates: { canonical: "/rivers" },
  title: "River gauges",
  description: "Check Frederick County river levels and streamflow using up to seven days of USGS observations.",
};
export const revalidate = 900;

export default async function RiversPage() {
  const { available, data: sites } = await getFrederickWaterSitesWithHistoryResult("PT6H");
  const now = new Date();
  const coverage = currentFloodCoverage(available, sites, now);
  const lead = coverage.worst?.category.key !== "normal" ? coverage.worst?.site.id : undefined;
  return <div className={styles.page}>
    <header className={styles.header}><h1>River gauges</h1><p>{riverCoverageSummary(coverage, sites.length)}</p></header>
    <RiverGaugeExplorer sites={sites} initialGauge={lead} end={now.toISOString()} />
    <footer className={styles.links}>
      <p>USGS observations are provisional. Check the National Weather Service for flood warnings and forecasts.</p>
      <a href="https://water.noaa.gov/wfo/lwx" target="_blank" rel="noopener noreferrer">NWS regional river forecasts</a>
      <a href="https://api.waterdata.usgs.gov/ogcapi/v1/collections/monitoring-locations/items?f=html&state_code=24&county_code=021&agency_code=USGS&site_type_code=ST&limit=200" target="_blank" rel="noopener noreferrer">USGS stream monitoring locations</a>
      <Link href="/pulse?open=rivers">River details in County status</Link>
    </footer>
  </div>;
}
