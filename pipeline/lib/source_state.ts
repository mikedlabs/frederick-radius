import { existsSync, readFileSync } from "node:fs";
import { parseDocument } from "yaml";

type SourceNode = {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
};

const DATE_FIELDS = ["last_success", "last_validated", "last_changed"] as const;

export function seedPriorSourceState(
  doc: ReturnType<typeof parseDocument>,
  priorManifest: string | undefined,
): number {
  if (!priorManifest || !existsSync(priorManifest)) return 0;

  const prior = parseDocument(readFileSync(priorManifest, "utf8"));
  const priorSources = prior.get("sources") as { items: SourceNode[] };
  const currentSources = doc.get("sources") as { items: SourceNode[] };
  let seeded = 0;

  for (const row of priorSources?.items ?? []) {
    const id = row.get("id");
    if (typeof id !== "string") continue;

    const current = currentSources.items.find((candidate) => candidate.get("id") === id);
    if (!current) continue;

    let changed = false;
    for (const field of DATE_FIELDS) {
      const priorValue = row.get(field);
      if (typeof priorValue !== "string") continue;
      const currentValue = current.get(field);
      const priorTime = Date.parse(priorValue);
      const currentTime =
        typeof currentValue === "string" ? Date.parse(currentValue) : Number.NaN;
      if (
        Number.isFinite(priorTime) &&
        (!Number.isFinite(currentTime) || priorTime > currentTime)
      ) {
        current.set(field, priorValue);
        changed = true;
      }
    }

    const priorSuccess = row.get("last_success");
    const currentSuccess = current.get("last_success");
    const priorHash = row.get("last_payload_sha256");
    const priorSuccessTime =
      typeof priorSuccess === "string" ? Date.parse(priorSuccess) : Number.NaN;
    const currentSuccessTime =
      typeof currentSuccess === "string" ? Date.parse(currentSuccess) : Number.NaN;
    if (
      typeof priorHash === "string" &&
      Number.isFinite(priorSuccessTime) &&
      (!Number.isFinite(currentSuccessTime) || priorSuccessTime >= currentSuccessTime) &&
      current.get("last_payload_sha256") !== priorHash
    ) {
      current.set("last_payload_sha256", priorHash);
      changed = true;
    }

    if (changed) seeded += 1;
  }

  return seeded;
}
