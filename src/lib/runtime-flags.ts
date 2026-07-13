import "server-only";
import { get } from "@vercel/edge-config";

export type RuntimeFlag =
  | "disableAsk"
  | "disableBetaEmail"
  | "disableFeedback";

/**
 * Runtime kill switches backed by Vercel Edge Config.
 *
 * Defaults are deliberately "off" and fail-open: if EDGE_CONFIG is not
 * connected, unavailable, or the key is missing, the app behaves exactly as it
 * did before. Flipping a key to true disables the matching expensive or open
 * intake route globally without a redeploy.
 */
export async function isRuntimeFlagEnabled(flag: RuntimeFlag): Promise<boolean> {
  if (!process.env.EDGE_CONFIG) return false;
  try {
    return (await get<boolean>(flag)) === true;
  } catch {
    return false;
  }
}
