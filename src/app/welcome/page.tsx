import type { Metadata } from "next";
import WelcomeFlow from "@/components/welcome/WelcomeFlow";

export const metadata: Metadata = {
  robots: { index: false },
  title: "Welcome",
  description:
    "Tell Frederick Radius whether you live here or are visiting so it can adjust the guide.",
};

/**
 * First-run entry route. Lives outside the (app) route group, so it
 * renders chrome-free (no bottom nav, no header) like /submit. Middleware
 * sends first-time visitors of / and /today here once.
 */
export default function WelcomePage() {
  return <WelcomeFlow />;
}
