import { redirect } from "next/navigation";
import { fairCampaignHref } from "@/lib/fair/campaign";

/**
 * Short, spoken, and QR-friendly doorway into the current Fair guide.
 * Keep this temporary so the destination can move to the next year's moment
 * without browsers caching an old seasonal URL.
 */
export default async function FairPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(fairCampaignHref(await searchParams));
}
