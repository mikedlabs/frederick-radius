import type {
  GoogleAuthorAttribution,
  GooglePhotoAttribution,
} from "@/lib/integrations/google-places";

export const GOOGLE_REVIEW_SELECTION_DISCLOSURE =
  "Review selection: 4–5 stars and 40–240 characters; routine logistics topics are deprioritized, then higher ratings and concise length.";

function safeGoogleUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, "https://www.google.com");
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}
function AuthorLink({ author }: { author: GoogleAuthorAttribution }) {
  const href = safeGoogleUrl(author.uri);
  const name = author.display_name?.trim();
  if (!name) return null;
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
      {name}
    </a>
  ) : (
    <span>{name}</span>
  );
}

/** Attribution that stays inside the same visual container as a Google photo. */
export function GooglePhotoAttributionLine({
  attribution,
  placeGoogleMapsUri,
  compact = false,
}: {
  attribution?: GooglePhotoAttribution;
  placeGoogleMapsUri?: string;
  compact?: boolean;
}) {
  const authors = attribution?.authors.filter((author) => author.display_name?.trim()) ?? [];
  const sourceHref = safeGoogleUrl(attribution?.google_maps_uri ?? placeGoogleMapsUri);

  return (
    <span className={compact ? "text-[9px] leading-none" : "text-[10px] leading-tight"}>
      {authors.length > 0 && (
        <>
          Photo by {authors.map((author, index) => (
            <span key={`${author.uri ?? author.display_name}-${index}`}>
              {index > 0 ? ", " : ""}
              <AuthorLink author={author} />
            </span>
          ))}{" "}·{" "}
        </>
      )}
      {sourceHref ? (
        <a href={sourceHref} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
          <span translate="no">Google Maps</span>
        </a>
      ) : (
        <span translate="no">Google Maps</span>
      )}
    </span>
  );
}

/** Review author/source line plus Google's required explanation of filtering. */
export function GoogleReviewAttribution({
  author,
  authorUri,
  reviewGoogleMapsUri,
  placeGoogleMapsUri,
}: {
  author?: string;
  authorUri?: string;
  reviewGoogleMapsUri?: string;
  placeGoogleMapsUri?: string;
}) {
  const sourceHref = safeGoogleUrl(reviewGoogleMapsUri ?? placeGoogleMapsUri);
  return (
    <figcaption className="mt-1 space-y-0.5 text-[11px]" style={{ color: "var(--app-ink-3)" }}>
      <span className="block">
        {author ? (
          <>
            <AuthorLink author={{ display_name: author, uri: authorUri }} />{" "}·{" "}
          </>
        ) : null}
        {sourceHref ? (
          <a href={sourceHref} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            <span translate="no">Google Maps</span> review
          </a>
        ) : (
          <><span translate="no">Google Maps</span> review</>
        )}
      </span>
      <span className="block text-[10px] leading-snug">{GOOGLE_REVIEW_SELECTION_DISCLOSURE}</span>
    </figcaption>
  );
}
