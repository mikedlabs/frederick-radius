import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import PageBloom from "@/components/ui/PageBloom";
import TrafficCameraWall from "@/components/cameras/TrafficCameraWall";
import { getChartCameras } from "@/lib/integrations/chartCameras";

export const revalidate = 1800;

export const metadata: Metadata = {
  title: "Frederick road cameras",
  description:
    "View official Maryland CHART traffic cameras on Frederick County roads.",
  alternates: { canonical: "/cameras" },
};

export default async function CamerasPage({
  searchParams,
}: {
  searchParams: Promise<{ camera?: string }>;
}) {
  const [{ camera }, cameras] = await Promise.all([
    searchParams,
    getChartCameras().catch(() => []),
  ]);

  return (
    <div className="relative mx-auto max-w-3xl space-y-6 py-6">
      <PageBloom variant="cool" />

      <header>
        <p className="eyebrow" style={{ color: "var(--app-ink-3)" }}>
          Maryland CHART
        </p>
        <h1
          className="mt-1 font-sans text-[30px] font-semibold leading-[1.05] tracking-tight"
          style={{ color: "var(--app-ink)" }}
        >
          Frederick road cameras
        </h1>
        <p
          className="mt-2 max-w-xl text-[14px] leading-relaxed"
          style={{ color: "var(--app-ink-2)" }}
        >
          Check current road conditions from public cameras along I-70, US 15,
          US 340, and other Frederick County routes. Start with one camera or
          open the live wall when you need the wider picture.
        </p>
      </header>

      <TrafficCameraWall
        initial={cameras}
        initialCameraId={camera}
      />

      <Link
        href="/map?show=cameras,traffic"
        className="group flex min-h-11 items-center justify-between gap-3 rounded-[var(--app-radius-md)] border px-3.5 text-[13px] font-semibold"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-bg-elevated)",
          color: "var(--app-ink)",
        }}
      >
        See cameras with traffic on the map
        <ArrowRight
          className="h-4 w-4 transition group-hover:translate-x-0.5"
          strokeWidth={2.2}
          aria-hidden
        />
      </Link>
    </div>
  );
}
