import { redirect } from "next/navigation";

// The app opens on /today — the time + distance answer to "what's worth my
// time in Frederick right now," led by the open + happening-near-you surface.
// (2026 standard: a no-plan arrival wants the answer, not a category funnel;
// the /guide funnel stays one tap away under the Find tab for category browse.)
// Old "/" bookmarks and the PWA entry now land on the answer.
export default function Home() {
  redirect("/today");
}
