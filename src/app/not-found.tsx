import NotFoundContent, { NOT_FOUND_METADATA } from "@/components/nav/NotFoundContent";

export const metadata = NOT_FOUND_METADATA;

/** Standalone unknown routes do not inherit the app's main landmark. */
export default function NotFound() {
  // Outside the app shell nothing else supplies the page gutters, so this
  // main carries its own: the same 1rem and 1.25rem as the shell's reading
  // column, widened to the safe area so a notched phone in landscape keeps
  // the content clear of the cutout.
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="pb-10 pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pt-4 sm:pl-[max(1.25rem,env(safe-area-inset-left,0px))] sm:pr-[max(1.25rem,env(safe-area-inset-right,0px))] sm:pt-6"
    >
      <NotFoundContent />
    </main>
  );
}
