/**
 * Encode a Mapbox route for Search Box search-along-route. Coordinates enter
 * Radius as [lng, lat]; the polyline format writes latitude then longitude.
 */
export function encodePolyline(
  coordinates: Array<[number, number]>,
  precision = 6,
): string | null {
  if (coordinates.length < 2) return null;
  const factor = 10 ** precision;
  let previousLat = 0;
  let previousLng = 0;
  let encoded = "";

  const append = (delta: number) => {
    let value = delta < 0 ? ~(delta << 1) : delta << 1;
    while (value >= 0x20) {
      encoded += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
      value >>= 5;
    }
    encoded += String.fromCharCode(value + 63);
  };

  for (const [lng, lat] of coordinates) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    const nextLat = Math.round(lat * factor);
    const nextLng = Math.round(lng * factor);
    append(nextLat - previousLat);
    append(nextLng - previousLng);
    previousLat = nextLat;
    previousLng = nextLng;
  }

  return encoded;
}
