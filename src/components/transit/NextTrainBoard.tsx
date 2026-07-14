import { TrainFront, AlertTriangle, ArrowRight, ArrowLeft } from "lucide-react";
import {
  getMarcBoard,
  getMarcAlerts,
  type MarcAlert,
  type MarcDeparture,
  type MarcStationBoard,
} from "@/lib/integrations/marcTrains";

/**
 * NextTrainBoard — live MARC Brunswick Line departures for the four
 * Frederick County stations, schedule-backed with a realtime delay
 * overlay. Server component; both feeds fail soft to empty.
 *
 * The board is the capability locals cannot get elsewhere: a single
 * Frederick-scoped "when is the next train" view, instead of MTA's
 * system-wide site. Honest about sparse service: a weekday-only line
 * shows one clear "no trains today" note on weekends rather than four
 * empty cards, and a station past its last train says so.
 */
function statusChip(d: MarcDeparture) {
  if (!d.live || d.delayMin == null) {
    return (
      <span className="text-[11px] font-medium uppercase tracking-[0.08em]" style={{ color: "var(--app-ink-3)" }}>
        scheduled
      </span>
    );
  }
  if (Math.abs(d.delayMin) < 2) {
    return (
      <span className="text-[11px] font-bold" style={{ color: "var(--app-positive)" }}>
        On time
      </span>
    );
  }
  const late = d.delayMin > 0;
  return (
    <span
      className="text-[11px] font-bold tabular-nums"
      style={{ color: late ? "var(--app-warning)" : "var(--app-cool)" }}
    >
      {late ? `+${d.delayMin} min` : `${Math.abs(d.delayMin)} min early`}
    </span>
  );
}

function DirectionRow({
  icon: Icon,
  deps,
}: {
  icon: typeof ArrowRight;
  deps: MarcDeparture[];
}) {
  if (deps.length === 0) return null;
  const next = deps[0];
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} style={{ color: "var(--app-cool)" }} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="text-[13px] font-semibold tabular-nums" style={{ color: "var(--app-ink)" }}>
          {next.live && next.predicted ? next.predicted : next.scheduled}
        </span>
        <span className="ml-1.5 text-[12px]" style={{ color: "var(--app-ink-2)" }}>
          to {next.headsign}
        </span>
        {deps[1] && (
          <span className="ml-1.5 text-[11px] tabular-nums" style={{ color: "var(--app-ink-3)" }}>
            then {deps[1].live && deps[1].predicted ? deps[1].predicted : deps[1].scheduled}
          </span>
        )}
      </span>
      {statusChip(next)}
    </div>
  );
}

export default async function NextTrainBoard({
  board: providedBoard,
  alerts: providedAlerts,
}: {
  board?: { stations: MarcStationBoard[]; serviceToday: boolean };
  alerts?: MarcAlert[];
} = {}) {
  // /pulse already fetched both values for its summary, while /transit can
  // continue to let this panel own its reads.
  const [board, alerts] = providedBoard !== undefined && providedAlerts !== undefined
    ? [providedBoard, providedAlerts]
    : await Promise.all([getMarcBoard(new Date()), getMarcAlerts()]);
  const { stations, serviceToday } = board;

  return (
    <section aria-labelledby="marc-board-heading" className="space-y-3">
      <header className="flex items-baseline gap-2">
        <h2
          id="marc-board-heading"
          className="inline-flex items-center gap-1.5 font-serif text-[20px] font-semibold tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          <TrainFront className="h-4 w-4" strokeWidth={2} style={{ color: "var(--app-cool)" }} aria-hidden />
          Next MARC trains
        </h2>
        <span className="ml-auto text-[11px]" style={{ color: "var(--app-ink-3)" }}>
          Brunswick Line
        </span>
      </header>

      {alerts.length > 0 && (
        <ul className="space-y-1.5">
          {alerts.slice(0, 3).map((a, i) => (
            <li
              key={i}
              className="flex items-start gap-2 rounded-[var(--app-radius-md)] border px-3 py-2 text-[12px] leading-snug"
              style={{
                borderColor: "var(--app-border)",
                background: "color-mix(in srgb, var(--app-warning) 10%, var(--app-bg-elevated))",
                color: "var(--app-ink-2)",
              }}
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} style={{ color: "var(--app-warning)" }} aria-hidden />
              <span>
                {a.header && <strong style={{ color: "var(--app-ink)" }}>{a.header}. </strong>}
                {a.description}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!serviceToday ? (
        <p
          className="rounded-[var(--app-radius-md)] border border-dashed px-4 py-5 text-center text-[13px]"
          style={{ borderColor: "var(--app-border)", color: "var(--app-ink-3)" }}
        >
          The Brunswick Line runs weekday commuter service. No county trains scheduled today.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {stations.map(({ station, departures }) => {
            const none = departures.eb.length === 0 && departures.wb.length === 0;
            return (
              <li
                key={station.key}
                className="rounded-[var(--app-radius-md)] border bg-[var(--app-bg-elevated)] p-3"
                style={{ borderColor: "var(--app-border)", boxShadow: "var(--app-elev-1), var(--app-edge), var(--app-hi)" }}
              >
                <p className="text-[14px] font-semibold tracking-tight" style={{ color: "var(--app-ink)" }}>
                  {station.name}
                </p>
                {none ? (
                  <p className="mt-1.5 text-[12px]" style={{ color: "var(--app-ink-3)" }}>
                    No more trains here today.
                  </p>
                ) : (
                  <div className="mt-2 space-y-1.5">
                    <DirectionRow icon={ArrowRight} deps={departures.eb} />
                    <DirectionRow icon={ArrowLeft} deps={departures.wb} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[11px]" style={{ color: "var(--app-ink-3)" }}>
        Scheduled times from MTA Maryland GTFS, live delays from the MARC realtime feed.
        Always confirm on the platform.
      </p>
    </section>
  );
}
