import type { Metadata } from "next";
import MasterSceneManager from "@/components/marketing/MasterSceneManager";

// Investor/marketing pitch surface — not part of the public field guide, so
// keep it out of the search index.
export const metadata: Metadata = {
  title: "Pitch",
  robots: { index: false },
};

/**
 * FREDERICK RADIUS // FLAGSHIP EXPERIENCE
 * Master Design & Data Synthesis
 * 10 Cinematic Scenes powered by the City Data Engine
 */
export default function Home() {
  return (
    <main className="bg-[#030014] min-h-screen text-white overflow-hidden">
      <MasterSceneManager />
    </main>
  );
}
