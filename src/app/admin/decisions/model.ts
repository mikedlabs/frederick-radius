export type DecisionAggregateRow = {
  day: string;
  surface: string;
  stage: string;
  entityKind: string;
  position: string;
  action: string;
  count: number;
};

export type DecisionStageTotals = {
  impressions: number;
  opens: number;
  actions: number;
  feedback: number;
};

export type DecisionSurfaceSummary = DecisionStageTotals & {
  surface: string;
};

export type DecisionDashboardSummary = DecisionStageTotals & {
  helpful: number;
  notRelevant: number;
  wrong: number;
  surfaces: DecisionSurfaceSummary[];
  actionBreakdown: Array<{ action: string; count: number }>;
};

const SURFACE_ORDER = [
  "today",
  "ask",
  "map",
  "events",
  "place",
  "saved",
  "compass",
  "search",
];

function emptyStageTotals(): DecisionStageTotals {
  return { impressions: 0, opens: 0, actions: 0, feedback: 0 };
}

function addStage(total: DecisionStageTotals, stage: string, count: number): void {
  if (stage === "impression") total.impressions += count;
  else if (stage === "open") total.opens += count;
  else if (stage === "action") total.actions += count;
  else if (stage === "feedback") total.feedback += count;
}

/** Turn low-cardinality rows into the compact owner-facing funnel. */
export function summarizeDecisionRows(
  rows: DecisionAggregateRow[],
): DecisionDashboardSummary {
  const totals = emptyStageTotals();
  const surfaceMap = new Map<string, DecisionStageTotals>();
  const actionMap = new Map<string, number>();
  let helpful = 0;
  let notRelevant = 0;
  let wrong = 0;

  for (const row of rows) {
    const count = Number.isSafeInteger(row.count) && row.count > 0 ? row.count : 0;
    if (count === 0) continue;
    addStage(totals, row.stage, count);
    const surface = surfaceMap.get(row.surface) ?? emptyStageTotals();
    addStage(surface, row.stage, count);
    surfaceMap.set(row.surface, surface);

    if (row.stage === "action") {
      actionMap.set(row.action, (actionMap.get(row.action) ?? 0) + count);
    } else if (row.stage === "feedback") {
      if (row.action === "helpful") helpful += count;
      else if (row.action === "not_relevant") notRelevant += count;
      else if (row.action === "wrong") wrong += count;
    }
  }

  const order = new Map(SURFACE_ORDER.map((surface, index) => [surface, index]));
  const surfaces = [...surfaceMap.entries()]
    .map(([surface, values]) => ({ surface, ...values }))
    .sort(
      (a, b) =>
        (order.get(a.surface) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(b.surface) ?? Number.MAX_SAFE_INTEGER),
    );
  const actionBreakdown = [...actionMap.entries()]
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count || a.action.localeCompare(b.action));

  return {
    ...totals,
    helpful,
    notRelevant,
    wrong,
    surfaces,
    actionBreakdown,
  };
}

export function decisionRate(numerator: number, denominator: number): string {
  if (denominator <= 0) return "n/a";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

export function decisionLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
