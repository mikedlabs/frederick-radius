"use client";

/**
 * Shown only by the service worker when a navigation fails and there is
 * no cached copy. Deliberately tiny and dependency-free so it works
 * with zero network.
 */
export default function OfflinePage() {
  return (
    <div
      className="flex min-h-[80vh] flex-col items-center justify-center px-6 text-center"
      style={{ color: "var(--app-ink)" }}
    >
      <span
        aria-hidden
        className="grid h-16 w-16 place-items-center rounded-[var(--app-radius-lg)]"
        style={{ background: "var(--app-brand)" }}
      >
        <span
          className="grid h-7 w-7 place-items-center rounded-full"
          style={{ border: "3px solid #fff" }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#fff" }} />
        </span>
      </span>
      <h1 className="mt-5 font-serif text-2xl font-semibold tracking-tight">
        You are offline
      </h1>
      <p className="mt-2 max-w-xs text-[14px] leading-snug" style={{ color: "var(--app-ink-2)" }}>
        Frederick Radius needs a connection for live conditions and events. Pages
        you have already opened may still load offline.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="tactile tactile-interactive tactile-lift mt-6 rounded-[var(--app-radius-md)] px-5 py-3 text-[14px] font-semibold text-white"
        style={{ background: "var(--app-brand)" }}
      >
        Try again
      </button>
    </div>
  );
}
