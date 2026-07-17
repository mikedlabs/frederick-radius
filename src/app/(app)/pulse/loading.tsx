import PageBloom from "@/components/ui/PageBloom";

export default function PulseLoading() {
  return (
    <div className="relative space-y-5 pb-4" aria-label="Loading the county pulse" aria-busy="true">
      <PageBloom variant="warm-cool" />
      <div
        className="min-h-[280px] animate-pulse overflow-hidden border-y p-6 sm:rounded-[8px] sm:border"
        style={{
          borderColor: "rgba(255,255,255,.1)",
          background: "linear-gradient(145deg, #171510, #0e0d0b)",
          boxShadow: "0 28px 62px -36px rgba(18,14,10,.78)",
        }}
      >
        <div className="h-2.5 w-28 rounded-full bg-white/20" />
        <div className="mt-7 h-9 w-4/5 max-w-md rounded-xl bg-white/20" />
        <div className="mt-3 h-3 w-full max-w-lg rounded-full bg-white/15" />
        <div className="mt-2 h-3 w-3/4 max-w-sm rounded-full bg-white/15" />
        <div className="mt-7 grid grid-cols-2 gap-2">
          <div className="h-9 rounded-lg bg-white/10" />
          <div className="h-9 rounded-lg bg-white/10" />
        </div>
      </div>
      <div className="h-16 animate-pulse border-y border-[var(--app-border)] bg-black/[0.025]" />
      <div className="grid grid-cols-2 gap-2.5">
        <div className="h-24 animate-pulse border-y border-[var(--app-border)] bg-black/[0.025]" />
        <div className="h-24 animate-pulse border-y border-[var(--app-border)] bg-black/[0.025]" />
      </div>
      <span className="sr-only">Checking weather, roads, power, schools, and emergency feeds…</span>
    </div>
  );
}
