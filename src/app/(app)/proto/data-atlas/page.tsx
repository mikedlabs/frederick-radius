import { redirect } from "next/navigation";

export default function DataAtlasPage() {
  // Rather than duplicating the complex Map hierarchy, we use the main map
  // but pre-load the hidden 'land-value' layer via URL parameters.
  redirect("/map?layers=land-value");
}
