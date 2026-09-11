const MAPBOX_HARD_FAILURE_RE =
  /access token|token.*(?:invalid|required)|unauthorized|forbidden|\b40[13]\b|webgl|failed to initialize|context lost|style.*(?:failed|error|not found)|(?:failed|error|not found).*style/i;
const MAPBOX_LOAD_FAILURE_RE =
  /failed to (?:fetch|load)|unable to (?:fetch|load)|network ?error|load failed|sprite.*(?:failed|404|not found)|(?:failed|404|not found).*sprite/i;

/**
 * A credential, renderer, or style failure is always terminal. An individual
 * network/tile request is terminal only during cold start; once a style has
 * loaded, Mapbox can retry it without the app destroying a usable map.
 */
export function isFatalMapboxError(
  message: string,
  mapLoaded: boolean,
): boolean {
  if (MAPBOX_HARD_FAILURE_RE.test(message)) return true;
  return !mapLoaded && MAPBOX_LOAD_FAILURE_RE.test(message);
}
