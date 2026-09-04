import {
  FAIR_PHOTO_PREVIEW,
  FAIR_PHOTO_VIEWER_CSP,
  FAIR_PHOTO_VIEWER_SCRIPT,
} from "@/lib/fair/photo-viewer";

export const dynamic = "force-static";

/** A separate document, intentionally outside React's shared app layout. */
export function GET() {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Fair night photograph</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}img,canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none}canvas{opacity:0}canvas[data-ready]{opacity:1}</style></head><body><img src="${FAIR_PHOTO_PREVIEW}" alt="The Great Frederick Fairgrounds at night, photographed by Mike D during a previous fair." width="960" height="540"><script defer src="${FAIR_PHOTO_VIEWER_SCRIPT}"></script></body></html>`, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": FAIR_PHOTO_VIEWER_CSP,
      "Cache-Control": "public, max-age=0, must-revalidate",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "geolocation=(), camera=(), microphone=(), payment=(), accelerometer=(), gyroscope=()",
    },
  });
}
