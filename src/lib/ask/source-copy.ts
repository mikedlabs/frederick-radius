import { classifyDescription } from "@/lib/copy-quality";

/** Ask source cards are trust anchors, not a place for raw directory copy.
 * Return the first publishable description and omit the field otherwise. */
export function safeAskDescription(
  name: string,
  ...candidates: Array<string | null | undefined>
): string | undefined {
  for (const candidate of candidates) {
    const text = candidate?.trim();
    if (!text) continue;
    const quality = classifyDescription(name, text);
    if (quality === "auto_clean" || quality === "reviewed") return text;
  }
  return undefined;
}
