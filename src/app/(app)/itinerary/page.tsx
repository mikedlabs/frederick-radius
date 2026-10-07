import ItineraryClient from "./ItineraryClient";

export const metadata = {
  title: "Day Plan | Frederick Radius",
  description: "Review events saved on this device, in time order or on a map.",
};

export default async function ItineraryPage() {
  // Let the client fetch the full event details from the snapshot 
  // since the itinerary is purely local state.
  return <ItineraryClient />;
}
