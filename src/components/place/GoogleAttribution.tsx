import type {
  GoogleAuthorAttribution,
  GooglePhotoAttribution,
} from "@/lib/integrations/google-places";
import GoogleAuthorAvatar from "@/components/place/GoogleAuthorAvatar";

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

export function safeGoogleReportUrl(value?: string): string | undefined {
  const href = safeGoogleUrl(value);
  if (!href) return undefined;
  const url = new URL(href);
  return /(^|\.)google\.com$/.test(url.hostname) ? url.href : undefined;
}

export function GoogleContentReportLink({
  href,
  label,
}: {
  href?: string;
  label: "Report photo" | "Report review";
}) {
  const safeHref = safeGoogleReportUrl(href);
  return safeHref ? (
    <a
      href={safeHref}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2"
    >
      {label}
    </a>
  ) : null;
}
function AuthorLink({ author, showAvatar = false }: { author: GoogleAuthorAttribution; showAvatar?: boolean }) {
  const href = safeGoogleUrl(author.uri);
  const avatar = safeGoogleUrl(author.photo_uri);
  const name = author.display_name?.trim();
  if (!name) return null;
  const content = (
    <>
      {showAvatar && avatar ? (
        <GoogleAuthorAvatar src={avatar} />
      ) : null}
      <span>{name}</span>
    </>
  );
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
      {content}
    </a>
  ) : <span className="inline-flex items-center gap-1">{content}</span>;
}

export function googlePhotoNameFromUrl(url: string): string | undefined {
  try {
    return new URL(url, "https://frederickradius.app").searchParams.get("name") ?? undefined;
  } catch {
    return undefined;
  }
}

export function googlePhotoAttributionForUrl(
  url: string,
  attributions: GooglePhotoAttribution[],
): GooglePhotoAttribution | undefined {
  const photoName = googlePhotoNameFromUrl(url);
  return photoName
    ? attributions.find((attribution) => attribution.photo_name === photoName)
    : undefined;
}

/** Attribution that stays inside the same visual container as a Google photo. */
export function GooglePhotoAttributionLine({
  attribution,
  placeGoogleMapsUri,
  compact = false,
  showAvatar = !compact,
}: {
  attribution?: GooglePhotoAttribution;
  placeGoogleMapsUri?: string;
  compact?: boolean;
  showAvatar?: boolean;
}) {
  const authors = attribution?.authors.filter((author) => author.display_name?.trim()) ?? [];
  const sourceHref = safeGoogleUrl(attribution?.google_maps_uri ?? placeGoogleMapsUri);

  return (
    <span
      data-inline-prose
      className={compact ? "text-xs leading-none" : "text-xs leading-tight"}
    >
      {authors.length > 0 && (
        <>
          Photo by {authors.map((author, index) => (
            <span key={`${author.uri ?? author.display_name}-${index}`}>
              {index > 0 ? ", " : ""}
              <AuthorLink author={author} showAvatar={showAvatar} />
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

/**
 * Compact credit that stays physically attached to a photo without covering
 * it with an opaque badge. The author profile and exact Google Maps photo
 * remain separate, readable links; the edge gradient only protects contrast.
 */
export function GooglePhotoAttributionOverlay({
  attribution,
  placeGoogleMapsUri,
}: {
  attribution?: GooglePhotoAttribution;
  placeGoogleMapsUri?: string;
}) {
  const authors = attribution?.authors.filter((author) => author.display_name?.trim()) ?? [];
  const sourceHref = safeGoogleUrl(attribution?.google_maps_uri ?? placeGoogleMapsUri);

  return (
    <span
      data-google-photo-attribution="overlay"
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-end bg-gradient-to-t from-black/80 via-black/30 to-transparent px-2 pb-1.5 pt-7 text-right text-[8px] font-medium leading-[1.15] text-white sm:text-[9px]"
      aria-label="Google photo attribution"
    >
      <span className="pointer-events-auto flex max-w-full flex-wrap items-center justify-end gap-x-1 gap-y-0.5 [text-shadow:0_1px_2px_rgb(0_0_0_/_0.9)]">
        {authors.length > 0 ? (
          <span className="inline-flex max-w-full items-center gap-1">
            <span className="opacity-75">Photo</span>
            {authors.map((author, index) => (
              <span key={`${author.uri ?? author.display_name}-${index}`}>
                {index > 0 ? ", " : ""}
                <AuthorLink author={author} />
              </span>
            ))}
          </span>
        ) : null}
        {authors.length > 0 ? <span aria-hidden className="opacity-60">·</span> : null}
        {sourceHref ? (
          <a
            href={sourceHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View this photo on Google Maps"
            className="shrink-0 underline decoration-white/60 underline-offset-2"
          >
            <span translate="no">Google Maps</span>
          </a>
        ) : (
          <span translate="no">Google Maps</span>
        )}
      </span>
    </span>
  );
}

/** Review author/source line plus Google's required explanation of filtering. */
export function GoogleReviewAttribution({
  author,
  authorUri,
  authorPhotoUri,
  reviewGoogleMapsUri,
  reviewFlagContentUri,
  placeGoogleMapsUri,
}: {
  author?: string;
  authorUri?: string;
  authorPhotoUri?: string;
  reviewGoogleMapsUri?: string;
  reviewFlagContentUri?: string;
  placeGoogleMapsUri?: string;
}) {
  const sourceHref = safeGoogleUrl(reviewGoogleMapsUri ?? placeGoogleMapsUri);
  const avatarSrc = safeGoogleUrl(authorPhotoUri);
  return (
    <figcaption className="mt-1 flex items-start gap-2 text-xs" style={{ color: "var(--app-ink-3)" }}>
      {avatarSrc && (
        // Google requires available review-author attribution to remain with
        // the review. A native image avoids proxying or retaining the avatar.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarSrc} alt="" width={24} height={24} className="mt-0.5 h-6 w-6 rounded-full object-cover" />
      )}
      <span className="min-w-0 space-y-0.5">
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
          {safeGoogleReportUrl(reviewFlagContentUri) ? (
            <>
              {" · "}
              <GoogleContentReportLink href={reviewFlagContentUri} label="Report review" />
            </>
          ) : null}
        </span>
        <span className="block text-xs leading-snug">{GOOGLE_REVIEW_SELECTION_DISCLOSURE}</span>
      </span>
    </figcaption>
  );
}
