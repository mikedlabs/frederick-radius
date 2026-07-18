import type { Metadata } from "next";
import AskFrederick from "@/components/ask/AskFrederick";
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
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawQuery = Array.isArray(params.q) ? params.q[0] : params.q;
  const initialQuery = rawQuery?.trim().slice(0, 300) ?? "";

  return (
    <div className="relative">
      <PageBloom variant="warm" />
      <AskFrederick mode="workspace" initialQuery={initialQuery} />
    </div>
  );
}
