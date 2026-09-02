import { z } from "zod";

export const FAIR_CAR_STORAGE_KEY = "fr-fair-car-v1";
export const FAIR_CAR_TTL_MS = 18 * 60 * 60 * 1000;
const FAIR_CAR_HARD_EXPIRY_MS = Date.parse("2026-09-28T04:00:00Z");

const savedFairCarSchema = z
  .object({
    version: z.literal(1),
    savedAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }),
    lotId: z
      .enum(["lot-infield", "lot-a", "lot-b", "lot-c", "lot-d", "unsure"])
      .nullable(),
    lotLabel: z.string().trim().min(1).max(80).nullable(),
    note: z.string().trim().min(1).max(120).nullable(),
    latitude: z.number().finite().min(-90).max(90).nullable(),
    longitude: z.number().finite().min(-180).max(180).nullable(),
    accuracyMeters: z.number().finite().min(0).max(10_000).nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const coordinateCount = [value.latitude, value.longitude].filter(
      (coordinate) => coordinate !== null,
    ).length;
    if (coordinateCount === 1) {
      ctx.addIssue({
        code: "custom",
        message: "latitude and longitude must be stored together",
        path: ["latitude"],
      });
    }
    if (coordinateCount === 0 && value.accuracyMeters !== null) {
      ctx.addIssue({
        code: "custom",
        message: "accuracy requires a saved coordinate",
        path: ["accuracyMeters"],
      });
    }
    if (Date.parse(value.expiresAt) <= Date.parse(value.savedAt)) {
      ctx.addIssue({
        code: "custom",
        message: "expiry must follow the save time",
        path: ["expiresAt"],
      });
    }
    if (
      value.lotId === null &&
      value.note === null &&
      value.latitude === null
    ) {
      ctx.addIssue({
        code: "custom",
        message: "a saved car needs a lot, note, or coordinate",
      });
    }
  });

export type SavedFairCar = z.infer<typeof savedFairCarSchema>;
export type FairCarGpsQuality = "good" | "weak" | "unavailable";

export type FairCarInput = {
  lotId?: SavedFairCar["lotId"];
  lotLabel?: string | null;
  note?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function normalizedOptionalText(
  value: string | null | undefined,
  maxLength: number,
): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized ? normalized.slice(0, maxLength) : null;
}

export function createSavedFairCar(
  input: FairCarInput,
  now = new Date(),
): SavedFairCar {
  const savedAtMs = now.getTime();
  if (!Number.isFinite(savedAtMs)) throw new Error("invalid Fair car save time");
  const expiresAtMs = Math.min(
    savedAtMs + FAIR_CAR_TTL_MS,
    FAIR_CAR_HARD_EXPIRY_MS,
  );
  if (expiresAtMs <= savedAtMs) {
    throw new Error("the 2026 Fair car-memory window has ended");
  }
  return savedFairCarSchema.parse({
    version: 1,
    savedAt: now.toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    lotId: input.lotId ?? null,
    lotLabel: normalizedOptionalText(input.lotLabel, 80),
    note: normalizedOptionalText(input.note, 120),
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    accuracyMeters: input.accuracyMeters ?? null,
  });
}

export function parseSavedFairCar(
  raw: string | null,
  now = new Date(),
): SavedFairCar | null {
  if (!raw) return null;
  try {
    const saved = savedFairCarSchema.parse(JSON.parse(raw));
    return Date.parse(saved.expiresAt) > now.getTime() ? saved : null;
  } catch {
    return null;
  }
}

export function readSavedFairCar(
  storage: StorageLike,
  now = new Date(),
): SavedFairCar | null {
  try {
    const raw = storage.getItem(FAIR_CAR_STORAGE_KEY);
    const saved = parseSavedFairCar(raw, now);
    if (raw && !saved) storage.removeItem(FAIR_CAR_STORAGE_KEY);
    return saved;
  } catch {
    return null;
  }
}

export function writeSavedFairCar(
  storage: StorageLike,
  saved: SavedFairCar,
): boolean {
  try {
    storage.setItem(FAIR_CAR_STORAGE_KEY, JSON.stringify(saved));
    return true;
  } catch {
    return false;
  }
}

export function clearSavedFairCar(storage: StorageLike): void {
  try {
    storage.removeItem(FAIR_CAR_STORAGE_KEY);
  } catch {
    // Storage can be unavailable. There is nothing else to clear.
  }
}

export function fairCarGpsQuality(
  saved: Pick<SavedFairCar, "latitude" | "longitude" | "accuracyMeters">,
): FairCarGpsQuality {
  if (saved.latitude === null || saved.longitude === null) return "unavailable";
  return saved.accuracyMeters !== null && saved.accuracyMeters > 100
    ? "weak"
    : "good";
}

function radians(value: number): number {
  return (value * Math.PI) / 180;
}

export function straightLineDistanceMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const startLatitude = radians(from.latitude);
  const endLatitude = radians(to.latitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(
    earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)),
  );
}

export function cardinalDirectionToCar(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" {
  const startLatitude = radians(from.latitude);
  const endLatitude = radians(to.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const y = Math.sin(longitudeDelta) * Math.cos(endLatitude);
  const x =
    Math.cos(startLatitude) * Math.sin(endLatitude) -
    Math.sin(startLatitude) *
      Math.cos(endLatitude) *
      Math.cos(longitudeDelta);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  const normalized = (bearing + 360) % 360;
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
  return directions[Math.round(normalized / 45) % directions.length];
}
