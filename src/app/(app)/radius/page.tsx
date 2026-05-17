import { redirect } from "next/navigation";

// Phase 2: Radius is now the home route. This path is kept so existing
// links, the PWA shortcut, and bookmarks do not 404 — it sends people
// to the canonical Radius experience at /.
export default function RadiusRedirect() {
  redirect("/");
}
