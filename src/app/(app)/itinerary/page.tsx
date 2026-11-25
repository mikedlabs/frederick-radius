import ItineraryClient from "./ItineraryClient";

export const metadata = {
  title: "Day Plan | Frederick Radius",
  description: "Events kept in your Day Plan on this device.",
};

export default async function ItineraryPage() {
  // Let the client fetch the full event details from the snapshot 
  // since the itinerary is purely local state.
  return <ItineraryClient />;
}
