/**
 * Embedded single-subject maps, such as the brewery map, must not inherit the
 * visitor's saved layers from the full county map. A camera, radar, or aerial
 * preference belongs to /map; leaking it into an embedded guide changes the
 * subject and can cover the intended pins.
 */
export function shouldInitializeReferenceLayer(
  compactSubjectMap: boolean,
  requested: boolean,
): boolean {
  return !compactSubjectMap && requested;
}
