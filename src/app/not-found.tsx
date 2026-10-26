import NotFoundContent, { NOT_FOUND_METADATA } from "@/components/nav/NotFoundContent";

export const metadata = NOT_FOUND_METADATA;

/** Standalone unknown routes do not inherit the app's main landmark. */
export default function NotFound() {
  return <main id="main-content" tabIndex={-1}><NotFoundContent /></main>;
}
