import type { Metadata } from "next";
import LocalOutingGuide from "@/components/today/LocalOutingGuide";
import { downtownGuideForVisit } from "@/lib/today/local-outing-guides";

type DowntownPageProps = {
  searchParams: Promise<{ returnTo?: string | string[]; day?: string | string[] }>;
};

export async function generateMetadata({ searchParams }: DowntownPageProps): Promise<Metadata> {
  const { day } = await searchParams;
  const guide = downtownGuideForVisit(new Date(), day);
  return {
    title: `${guide.title} in Frederick`,
    description: guide.summary,
    alternates: { canonical: "/today/two-hours-downtown" },
  };
}

export default async function DowntownGuidePage({ searchParams }: DowntownPageProps) {
  const { returnTo, day } = await searchParams;
  return <LocalOutingGuide guide={downtownGuideForVisit(new Date(), day)} returnTo={returnTo} />;
}
