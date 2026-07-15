import type { Metadata } from "next";
import MasterSceneManager from "@/components/marketing/MasterSceneManager";

// Investor/marketing pitch surface — not part of the public field guide, so
// keep it out of the search index.
export const metadata: Metadata = {
  title: "Product concept & private-beta overview",
  description:
    "An independent Frederick Radius product overview. Concept screens are labeled and are not government services or endorsements.",
  robots: { index: false },
};

export default function PitchPage() {
  return (
    <main id="main-content" tabIndex={-1} className="bg-[#030014] min-h-screen text-white overflow-hidden">
      <aside
        aria-label="Pitch disclosure"
        className="fixed left-3 right-24 top-3 z-[var(--z-overlay)] rounded-2xl border border-amber-300/25 bg-[#100b24]/90 px-3 py-2 text-[10px] font-medium leading-tight text-amber-50 shadow-2xl backdrop-blur-xl sm:left-1/2 sm:right-auto sm:max-w-[min(760px,calc(100vw-10rem))] sm:-translate-x-1/2 sm:rounded-full sm:px-5 sm:text-center sm:text-xs"
      >
        <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-amber-300 align-middle" />
        Concept prototype · Independent project · Not affiliated with or endorsed by Frederick City or Frederick County government.
      </aside>
      <MasterSceneManager />
    </main>
  );
}
