import { redirect } from "next/navigation";

// The app opens on the funnel front door (/guide): "what are you after?"
// → narrow → the answer. The /today briefing is now a secondary surface,
// reachable from the funnel and under the Find tab. Old "/" bookmarks and
// the PWA entry land on the funnel.
export default function Home() {
  redirect("/explore");
}
