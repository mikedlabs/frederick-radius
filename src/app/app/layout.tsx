import type { Metadata } from "next";
import BottomNav from "@/components/nav/BottomNav";
import TopBar from "@/components/nav/TopBar";

export const metadata: Metadata = {
  title: { template: "%s · Frederick Radius", default: "Frederick Radius" },
  description: "A smarter way to experience Frederick County.",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--app-bg)", color: "var(--app-ink)" }}
    >
      <TopBar />
      <main className="mx-auto max-w-screen-md px-4 pb-24 pt-4">{children}</main>
      <BottomNav />
    </div>
  );
}
