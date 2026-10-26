import NotFoundContent, { NOT_FOUND_METADATA } from "@/components/nav/NotFoundContent";

export const metadata = NOT_FOUND_METADATA;

/** AppMain already owns main-content and the page's main landmark. */
export default function AppNotFound() {
  return <NotFoundContent />;
}
