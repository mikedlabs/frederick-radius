import type { Metadata } from "next";
import LocalOutingGuide from "@/components/today/LocalOutingGuide";
import { downtownGuide } from "@/lib/today/local-outing-guides";

export const metadata: Metadata = {
  title: "Two Hours Downtown Frederick",
  description: "A two-hour walk through downtown Frederick with parking, free galleries, and a stroll along Carroll Creek.",
  alternates: { canonical: "/today/two-hours-downtown" },
};

export default async function DowntownGuidePage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const { returnTo } = await searchParams;
  return <LocalOutingGuide guide={downtownGuide} returnTo={returnTo} />;
}
