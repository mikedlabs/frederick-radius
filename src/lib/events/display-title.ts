/** Preserve the source's event name and supplied presenter in a compact label.
 * Canonical fields stay separate; no production name is inferred. */
export function eventDisplayTitle(event: { title: string; presenter?: unknown }): string {
  const presenter = typeof event.presenter === "string" ? event.presenter.trim() : "";
  if (!presenter) return event.title;
  const words = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (` ${words(event.title)} `.includes(` ${words(presenter)} `)) return event.title;
  return `${presenter}: ${event.title}`;
}
