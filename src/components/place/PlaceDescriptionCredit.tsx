import { ExternalLink } from "lucide-react";
import type { PlaceDescriptionSourceKind } from "@/lib/loaders/placeDescriptions";

const LABELS: Record<PlaceDescriptionSourceKind, string> = {
  business_website: "Business website",
  official_source: "Official source",
  field_note: "Radius field note",
  radius_editorial: "Radius editorial",
};

export default function PlaceDescriptionCredit({
  kind,
  url,
  verifiedAt,
}: {
  kind?: PlaceDescriptionSourceKind;
  url?: string;
  verifiedAt?: string;
}) {
  if (!kind || kind === "radius_editorial") return null;
  const date = verifiedAt && Number.isFinite(Date.parse(verifiedAt))
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(verifiedAt))
    : null;
  const label = `Source: ${LABELS[kind]}${date ? ` · checked ${date}` : ""}`;

  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline"
      style={{ color: "var(--app-ink-3)" }}
    >
      {label}
      <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  ) : (
    <p className="mt-1 text-xs" style={{ color: "var(--app-ink-3)" }}>{label}</p>
  );
}
