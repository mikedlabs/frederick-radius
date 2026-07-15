/**
 * Features whose production use depends on documented third-party permission.
 *
 * City aerial imagery is intentionally fail-closed. Setting this public build
 * variable is a release action and should happen only after written permission
 * to publicly display the imagery has been retained with the project records.
 */
export const CITY_AERIAL_IMAGERY_LICENSE_CONFIRMED =
  process.env.NEXT_PUBLIC_CITY_AERIAL_IMAGERY_LICENSE_CONFIRMED === "true";
