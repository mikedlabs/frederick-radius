/**
 * Credentials that must exist while Vercel compiles a user-facing build.
 * Keep this narrower than the operator credential audit: optional server
 * features may stay off, but a missing browser map token disables the core
 * interactive map for every visitor and must not become a green deployment.
 */
export function hostedBuildCredentialErrors(env = process.env) {
  const hostedEnvironment = env.VERCEL_ENV;
  if (hostedEnvironment !== "production" && hostedEnvironment !== "preview") {
    return [];
  }

  const browserToken = env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ?? "";
  if (!browserToken) {
    return [
      `NEXT_PUBLIC_MAPBOX_TOKEN is required for Vercel ${hostedEnvironment} builds`,
    ];
  }
  if (!browserToken.startsWith("pk.")) {
    return [
      "NEXT_PUBLIC_MAPBOX_TOKEN must be a publishable Mapbox pk. token",
    ];
  }
  return [];
}
