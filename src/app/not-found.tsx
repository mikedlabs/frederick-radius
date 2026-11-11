import NotFoundContent, { NOT_FOUND_METADATA } from "@/components/nav/NotFoundContent";

export const metadata = NOT_FOUND_METADATA;

/** Standalone unknown routes do not inherit the app's main landmark. */
export default function NotFound() {
  // Outside the app shell nothing else supplies the page gutters, so this
  // main carries the same ones AppMain gives the in-app 404.
  return <main id="main-content" tabIndex={-1} className="px-4 pb-10 pt-4 sm:px-5 sm:pt-6"><NotFoundContent /></main>;
}
