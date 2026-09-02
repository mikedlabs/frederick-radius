import FairGroundsMapMasthead from "./FairGroundsMapMasthead";

export default function FairGroundsMapLoading() {
  return (
    <section
      className="mt-5"
      role="status"
      aria-label="Loading the Fair grounds map"
      aria-busy="true"
    >
      <span className="sr-only">Opening the Fair grounds map…</span>
      <FairGroundsMapMasthead />
      <div className="mt-3 h-12 animate-pulse rounded-[var(--app-radius-lg)] bg-[var(--app-bg-sunken)] motion-reduce:animate-none" />
      <div className="mt-4 flex gap-2 overflow-hidden" aria-hidden>
        <div className="h-11 w-36 shrink-0 animate-pulse rounded-full bg-[var(--app-bg-sunken)] motion-reduce:animate-none" />
        <div className="h-11 w-24 shrink-0 animate-pulse rounded-full bg-[var(--app-bg-sunken)] motion-reduce:animate-none" />
        <div className="h-11 w-28 shrink-0 animate-pulse rounded-full bg-[var(--app-bg-sunken)] motion-reduce:animate-none" />
      </div>
      <div
        className="mt-3 h-[52dvh] min-h-[430px] max-h-[560px] animate-pulse rounded-[var(--app-radius-xl)] border bg-[var(--app-bg-sunken)] motion-reduce:animate-none"
        style={{ borderColor: "var(--app-border-strong)" }}
        aria-hidden
      />
    </section>
  );
}
