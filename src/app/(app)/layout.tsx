import BottomNav from "@/components/nav/BottomNav";
import TopBar from "@/components/nav/TopBar";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import InstallPrompt from "@/components/pwa/InstallPrompt";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--app-bg)", color: "var(--app-ink)" }}
    >
      <TopBar />
      <main className="mx-auto max-w-screen-md px-4 pb-24 pt-4">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
      <BottomNav />
      <InstallPrompt />
    </div>
  );
}
