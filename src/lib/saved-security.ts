import { isJsonObject, isRecognizedPushEndpoint } from "@/lib/push-security";

export type SavedRegistryInput = { slug: string; endpoint: string };

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,159}$/;

/** Parse only the two fields the reminder registry owns. */
export function parseSavedRegistryInput(value: unknown): SavedRegistryInput | null {
  if (!isJsonObject(value)) return null;
  if (Object.keys(value).some((key) => key !== "slug" && key !== "endpoint")) return null;
  if (typeof value.slug !== "string" || !SLUG_RE.test(value.slug)) return null;
  if (!isRecognizedPushEndpoint(value.endpoint)) return null;
  return { slug: value.slug, endpoint: value.endpoint };
}
