/** Client-safe event identity guard shared with the bounded archive reader. */
export const MAX_EVENT_SLUG_LENGTH = 200;

export function isResolvableEventSlug(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_EVENT_SLUG_LENGTH &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) &&
    value !== "constructor" && value !== "prototype";
}
