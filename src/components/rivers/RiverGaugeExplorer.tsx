"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import type { WaterSite } from "@/lib/integrations/usgsWater";
import FloodGauge from "@/components/live-data/FloodGauge";
import { classifyFlood, FLOOD_STAGES, nwsGaugeUrl } from "@/lib/integrations/floodStage";
import { GAP_MINUTES, gaugeLabel, gaugePlot, usgsGaugeReadingsUrl, type GaugeHistory, type GaugePeriod } from "@/lib/rivers/gaugeHistory";
import styles from "./RiverGaugeExplorer.module.css";

const ranges: Array<[GaugePeriod, string]> = [["PT6H", "6 hours"], ["P1D", "24 hours"], ["P7D", "7 days"]];
const dateTime = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
const day = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });
const flowNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
type Measure = "height" | "flow";
type Remote = { key: string; result?: GaugeHistory; failed?: boolean };
const fullUnit = { height: "feet", flow: "cubic feet per second" };
const shortUnit = { height: "ft", flow: "ft³/s" };
const measureLabel = { height: "Gauge height", flow: "Streamflow" };
const format = (value: number, measure: Measure) => measure === "height" ? value.toFixed(2) : flowNumber.format(value);

function HistoryChart({ history, period, measure, name }: { history: GaugeHistory; period: GaugePeriod; measure: Measure; name: string }) {
  const id = useId();
  const plot = useMemo(() => gaugePlot(history[measure], period, history.end), [history, measure, period]);
  const [index, setIndex] = useState<number | null>(null);
  if (!plot) return <p className={styles.message}>USGS returned no {measureLabel[measure].toLowerCase()} observations for this range.</p>;
  const selected = Math.min(index ?? plot.rows.length - 1, plot.rows.length - 1);
  const reading = plot.rows[selected];
  const point = plot.points[selected];
  const value = format(reading.value, measure);
  const valueText = `${value} ${fullUnit[measure]}, ${dateTime.format(new Date(reading.at))}`;
  const change = plot.rows[plot.rows.length - 1].value - plot.rows[0].value;
  const axisTime = (at: number) => (period === "P7D" ? day : dateTime).format(at);
  return <div>
    <div className={styles.readout}>
      <div>
        <p className={styles.label}>{selected === plot.rows.length - 1 ? "Latest in this range" : "Selected reading"}</p>
        <p className={styles.value}>{value} <span>{shortUnit[measure]}</span></p>
        <time dateTime={reading.at}>{dateTime.format(new Date(reading.at))}</time>
      </div>
      <div className={styles.extent}><span>Low <b>{format(plot.low, measure)} {shortUnit[measure]}</b></span><span>High <b>{format(plot.high, measure)} {shortUnit[measure]}</b></span></div>
    </div>
    <p className={styles.net}>{plot.rows.length === 1 ? "USGS reported one observation in this window." : change === 0
      ? "The first and last readings were the same."
      : `${measureLabel[measure]} ${change > 0 ? "rose" : "fell"} ${format(Math.abs(change), measure)} ${shortUnit[measure]} between the first and last readings.`}</p>
    <figure className={styles.figure}>
      <div className={styles.plot}>
        <div className={styles.scale} aria-hidden="true"><span>{format(plot.top, measure)}</span><span>{format(plot.bottom, measure)}</span></div>
        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label={`${measureLabel[measure]} at ${name}, from ${dateTime.format(plot.start)} to ${dateTime.format(plot.finish)}. Low ${format(plot.low, measure)}, high ${format(plot.high, measure)} ${fullUnit[measure]}. ${plot.segments.length > 1 ? "The record has gaps." : ""}`}>
          {[1, 50, 99].map((y) => <line key={y} x1="0" x2="1000" y1={y} y2={y} className={styles.gridLine} />)}
          {plot.segments.map((segment) => segment.length === 1
            ? <path key={segment[0].x} d={`M${segment[0].x} ${segment[0].y}h0.01`} className={styles.trace} />
            : <polyline key={segment[0].x} points={segment.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(2)}`).join(" ")} className={styles.trace} />)}
          <line x1={point.x} x2={point.x} y1="0" y2="100" className={styles.marker} />
          <path d={`M${point.x} ${point.y}h0.01`} className={styles.dot} />
        </svg>
      </div>
      <figcaption className={styles.axis}><span>{axisTime(plot.start)}</span><span>{axisTime(plot.finish)}</span></figcaption>
    </figure>
    {plot.rows.length > 1 && <label className={styles.scrub} htmlFor={id}>
      <span>Inspect a reading</span><input id={id} type="range" min={0} max={plot.rows.length - 1} step={1} value={selected}
        aria-valuetext={valueText} onChange={(event) => setIndex(Number(event.target.value))} />
    </label>}
    {(plot.segments.length > 1 || Date.parse(plot.rows[0].at) - plot.start > GAP_MINUTES * 60_000 || plot.finish - Date.parse(plot.rows[plot.rows.length - 1].at) > GAP_MINUTES * 60_000) &&
      <p className={styles.note}>Blank intervals have no plotted readings. Gaps longer than {GAP_MINUTES} minutes break the line.</p>}
  </div>;
}

export default function RiverGaugeExplorer({ sites, initialGauge, end }: { sites: WaterSite[]; initialGauge?: string; end: string }) {
  const start = sites.find((s) => s.id === initialGauge) ?? sites.find((s) => s.id === "01643000") ?? sites[0];
  const [gauge, setGauge] = useState(start?.id ?? "");
  const site = sites.find((s) => s.id === gauge) ?? start;
  const [period, setPeriod] = useState<GaugePeriod>("PT6H");
  const [measure, setMeasure] = useState<Measure>(start?.gageHistory?.length ? "height" : "flow");
  const [remote, setRemote] = useState<Remote | null>(null);
  const values = useRef(new Map<string, GaugeHistory>());
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  if (!site) return null;
  const name = gaugeLabel(site.name);
  const stages = FLOOD_STAGES[site.id];
  const latestHeight = site.gageHistory?.at(-1);
  const latestStage = classifyFlood(latestHeight?.value, stages);
  const key = site.id + period;
  const history = period === "PT6H" ? { end, height: site.gageHistory ?? [], flow: site.streamflowHistory ?? [] }
    : remote?.key === key ? remote.result : undefined;
  const failed = remote?.key === key && remote.failed;

  async function choose(nextGauge: string, nextPeriod: GaugePeriod) {
    request.current?.abort();
    setGauge(nextGauge);
    setPeriod(nextPeriod);
    if (nextGauge !== gauge) setMeasure(sites.find((s) => s.id === nextGauge)?.gageHistory?.length ? "height" : "flow");
    const nextKey = nextGauge + nextPeriod;
    if (nextPeriod === "PT6H") return;
    const cached = values.current.get(nextKey);
    if (cached && Date.now() - Date.parse(cached.end) < 15 * 60_000) {
      setRemote({ key: nextKey, result: cached });
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setRemote({ key: nextKey });
    try {
      const res = await fetch(`/api/rivers/history?gauge=${nextGauge}&period=${nextPeriod}`, { signal: controller.signal });
      if (!res.ok) throw new Error("Unavailable gauge history");
      const result: GaugeHistory = await res.json();
      if (controller.signal.aborted) return;
      values.current.set(nextKey, result);
      setRemote({ key: nextKey, result });
    } catch {
      if (!controller.signal.aborted) setRemote({ key: nextKey, failed: true });
    }
  }

  return <section aria-label="River gauge history" className={styles.explorer}>
    <label className={styles.selector}><span className={styles.label}>Monitoring location</span>
      <span className={styles.selectWrap}><span aria-hidden="true">{name}</span><ChevronDown size={18} aria-hidden />
      <select value={site.id} onChange={(event) => void choose(event.target.value, period)}>
        {sites.map((s) => <option key={s.id} value={s.id}>{gaugeLabel(s.name)}</option>)}
      </select></span>
    </label>
    <div className={styles.controls}>
      <fieldset><legend>Measurement</legend><div className={styles.buttons}>
        {(["height", "flow"] as const).map((m) => <button type="button" key={m} aria-pressed={measure === m} onClick={() => setMeasure(m)}>{measureLabel[m]}</button>)}
      </div></fieldset>
      <fieldset><legend>Time range</legend><div className={styles.buttons}>
        {ranges.map(([id, label]) => <button type="button" key={id} aria-pressed={id === period} onClick={() => void choose(site.id, id)}>{label}</button>)}
      </div></fieldset>
    </div>
    {history ? <HistoryChart key={key + measure} history={history} period={period} measure={measure} name={name} />
      : <div className={styles.message} role="status">{failed ? <>USGS history could not be loaded. <button type="button" onClick={() => void choose(site.id, period)}>Try again</button></> : "Loading observations from USGS…"}</div>}
    <div className={styles.sources}>
      <a href={usgsGaugeReadingsUrl(site.id)} target="_blank" rel="noopener noreferrer">USGS readings for {name} <ExternalLink aria-hidden size={14} /></a>
      {stages && <div><p>NWS action stage <strong>{stages.action} ft</strong> · Flood stage <strong>{stages.minor} ft</strong></p>
        <details><summary>All NWS thresholds</summary><p>Action {stages.action} ft · Minor {stages.minor} ft · Moderate {stages.moderate} ft · Major {stages.major} ft</p>
          {latestHeight && latestStage && <div className={styles.stage}><p>Gauge height at {dateTime.format(new Date(latestHeight.at))}</p><FloodGauge current={latestHeight.value} stages={stages} category={latestStage} /></div>}
        </details>
        <a href={nwsGaugeUrl(stages.nws)} target="_blank" rel="noopener noreferrer">NWS forecast and flood stages for {name} <ExternalLink aria-hidden size={14} /></a></div>}
    </div>
  </section>;
}
