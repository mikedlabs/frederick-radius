import { CompassHeading } from "@/components/nav/CompassHeading";
import Skeleton from "@/components/ui/Skeleton";

/**
 * Instant route-transition shell for /compass. The page title is the real
 * heading so a client navigation does not wait on CompassHub or /api/deck
 * before the LCP text can paint.
 */
export default function CompassLoading() {
  return (
    <div aria-busy="true" className="space-y-5">
      <span className="sr-only" role="status">
        Loading Compass
      </span>
      <header
        className="-mx-4 -mt-4 border-b px-4 pb-4 pt-4 sm:-mx-5 sm:-mt-6 sm:px-5 sm:pt-5 lg:mx-0 lg:mt-0"
        style={{ borderColor: "var(--app-border)" }}
      >
        <CompassHeading />
        <Skeleton.Block
          className="mt-4 w-full"
          height={48}
          round="var(--app-radius-md)"
        />
      </header>
    </div>
  );
}
