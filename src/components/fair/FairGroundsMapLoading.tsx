import FairGroundsMapMasthead from "./FairGroundsMapMasthead";

export default function FairGroundsMapLoading() {
  return (
    <section
      className="relative lg:mt-5"
      role="status"
      aria-label="Loading the Fair grounds map"
      aria-busy="true"
    >
      <span className="sr-only">Opening the Fair grounds map…</span>
      <div className="hidden lg:block">
        <FairGroundsMapMasthead />
      </div>
      <div
        className="h-[calc(100dvh-8rem)] min-h-[520px] animate-pulse border-y bg-[var(--app-bg-sunken)] motion-reduce:animate-none lg:mt-3 lg:h-[620px] lg:min-h-0 lg:rounded-[var(--app-radius-xl)] lg:border"
        style={{ borderColor: "var(--app-border-strong)" }}
        aria-hidden
      >
        <div className="mx-3 mt-3 h-12 rounded-[var(--app-radius-lg)] bg-[var(--app-bg-elevated-solid)] opacity-80" />
        <div className="mt-3 flex gap-2 overflow-hidden px-3">
          <div className="h-11 w-36 shrink-0 rounded-full bg-[var(--app-bg-elevated-solid)] opacity-80" />
          <div className="h-11 w-24 shrink-0 rounded-full bg-[var(--app-bg-elevated-solid)] opacity-80" />
          <div className="h-11 w-28 shrink-0 rounded-full bg-[var(--app-bg-elevated-solid)] opacity-80" />
        </div>
      </div>
    </section>
  );
}
