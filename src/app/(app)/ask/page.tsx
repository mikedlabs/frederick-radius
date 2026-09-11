import type { Metadata } from "next";
import AskFrederick from "@/components/ask/AskFrederick";
import { parseScope } from "@/lib/scope";
import PageBloom from "@/components/ui/PageBloom";

export const metadata: Metadata = {
  alternates: { canonical: "/ask" },
  title: "Ask Radius",
  description:
    "Ask for a Frederick County place, event, plan, civic answer, or useful public resource.",
  openGraph: {
    title: "Ask Radius",
    description:
      "Get a short, source-backed answer from the Frederick Radius local guide.",
  },
};

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; in?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawQuery = Array.isArray(params.q) ? params.q[0] : params.q;
  const rawScope = Array.isArray(params.in) ? params.in[0] : params.in;
  const initialScope = parseScope(rawScope);
  const initialQuery = rawQuery?.trim().slice(0, 300) ?? "";

  return (
    <div className="relative">
      <PageBloom variant="warm" />
      <AskFrederick key={`${initialQuery}:${initialScope}`} mode="workspace" initialQuery={initialQuery} initialScope={initialScope} />
    </div>
  );
}
