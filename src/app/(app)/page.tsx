import { redirect } from "next/navigation";

// Owner decision (2026-05-17): the app opens on Today, not Radius.
// Today is the daily landing — what's happening now and what's
// coming up. Radius is its own destination at /radius (and a nav
// tab). Old "/" bookmarks / the PWA entry land on Today.
export default function Home() {
  redirect("/today");
}
