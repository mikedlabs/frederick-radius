import type { Metadata } from "next";
import WelcomeFlow from "@/components/welcome/WelcomeFlow";

export const metadata: Metadata = {
  title: "Welcome",
  description:
    "Frederick County, at a glance. Tell us who you are and we'll tune what you see.",
};

/**
 * First-run entry route. Lives outside the (app) route group, so it
 * renders chrome-free (no bottom nav, no header) like /submit. Middleware
 * sends first-time visitors of / and /today here once.
 */
export default function WelcomePage() {
  return <WelcomeFlow />;
}
