import { redirect } from "next/navigation";

// Owner decision (2026-05-17): the app opens on Now (formerly Today),
// not Radius. Now is the daily landing — weather, what's open,
// what's happening right now, what's coming up next. Old "/" bookmarks
// and the PWA entry land on /now.
export default function Home() {
  redirect("/today");
}
