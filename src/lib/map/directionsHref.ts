/**
 * Platform-aware directions link. Apple devices get Apple Maps (the
 * default half of iPhone users actually want); everything else gets
 * Google. Client-only callers (the map peeks); SSR-safe fallback to
 * Google when navigator is absent.
 */
export function directionsHref(lat: number, lng: number): string {
  const apple =
    typeof navigator !== "undefined" &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      // iPadOS 13+ reports as Mac; the touch check tells them apart.
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
  return apple
    ? `https://maps.apple.com/?daddr=${lat},${lng}`
    : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
