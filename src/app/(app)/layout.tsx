import BottomNav from "@/components/nav/BottomNav";
import TopBar from "@/components/nav/TopBar";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import InstallPrompt from "@/components/pwa/InstallPrompt";
import { PlaceSheetProvider } from "@/components/place/PlaceSheetProvider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PlaceSheetProvider>
      <div
        className="min-h-screen"
        style={{ background: "var(--app-bg)", color: "var(--app-ink)" }}
      >
        <TopBar />
        <main
          className="mx-auto max-w-screen-md px-4 pt-4"
          style={{
            paddingBottom: "calc(6rem + env(safe-area-inset-bottom, 0px))",
          }}
        >
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
        <BottomNav />
        <InstallPrompt />
      </div>
    </PlaceSheetProvider>
  );
}
