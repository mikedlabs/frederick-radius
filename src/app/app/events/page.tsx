import ComingSoon from "@/components/today/ComingSoon";
export const metadata = { title: "Events" };
export default function EventsPage() {
  return (
    <ComingSoon
      title="Events"
      description="What's happening in Frederick County — ingested from DFP, Celebrate Frederick, the County calendar, NPS, and Ticketmaster. Wired up in Phase 1 (Sprints 3–4)."
    />
  );
}
