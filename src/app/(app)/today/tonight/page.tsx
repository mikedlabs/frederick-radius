import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";
import TonightExperience from "@/components/today/TonightExperience";
import TonightWeather from "@/components/today/TonightWeather";
import CivicAlerts from "@/components/today/CivicAlerts";
import PlaceSheetBoundary from "@/components/place/PlaceSheetBoundary";
import { loadTonightPreview } from "@/lib/today/tonight-preview";
import { parseScope, scopeToParam, SCOPE_COOKIE } from "@/lib/scope";

export const metadata: Metadata = {
  title: "Plan tonight in Frederick County",
  description: "Choose a place for tonight with a clear reason, honest hours and the details to plan your visit.",
  alternates: { canonical: "/today" },
  robots: { index: false, follow: false },
};

type Query = Record<string, string | string[] | undefined>;
const first = (value: Query[string]) => typeof value === "string" ? value : value?.[0];

export default async function TonightPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const cookieStore = await cookies();
  const scope = parseScope(first(query.in)) ?? parseScope(cookieStore.get(SCOPE_COOKIE)?.value) ?? "county";
  const data = loadTonightPreview({ town: scope, intent: first(query.intent) });
  const params = new URLSearchParams({ intent: data.intent, in: scopeToParam(data.scope) });
  const returnTo = `/today/tonight?${params}`;

  return (
    <PlaceSheetBoundary fetchMissing>
      <TonightExperience data={data}
        weather={<Suspense fallback={<p className="min-h-11 py-3 text-[15px]" style={{ color: "var(--app-ink-3)" }}>Checking the NWS forecast…</p>}><TonightWeather startsAt={data.startsAt} returnTo={returnTo} /></Suspense>}
        alerts={<Suspense fallback={null}><CivicAlerts compact returnTo={returnTo} /></Suspense>}
      />
    </PlaceSheetBoundary>
  );
}
