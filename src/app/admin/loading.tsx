/**
 * Shared loading boundary for every /admin route. The tools are force-dynamic
 * with blocking DB reads (Supabase over a Supavisor pool that can cold-start),
 * so without this the owner got a blank white screen until the query returned.
 * A quiet skeleton of the hub's header + queue + stat grid reads as "the desk
 * is coming up," not "nothing happened."
 */
export default function AdminLoading() {
  return (
    <div className="mx-auto max-w-screen-md px-4 py-6" aria-busy="true" aria-label="Loading the admin desk">
      <div className="animate-pulse space-y-5">
        <div className="h-3 w-16 rounded" style={{ background: "var(--app-bg-elevated)" }} />
        <div className="h-8 w-48 rounded" style={{ background: "var(--app-bg-elevated)" }} />
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 rounded-[var(--app-radius-md)] border" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 rounded-[var(--app-radius-md)] border" style={{ borderColor: "var(--app-border)", background: "var(--app-bg-elevated)" }} />
          ))}
        </div>
      </div>
    </div>
  );
}
