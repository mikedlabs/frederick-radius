/**
 * RFC 9116 security contact. Keeping this outside the beta wall gives a
 * researcher a clear, non-public path to report a vulnerability responsibly.
 */
export const dynamic = "force-static";

const BODY = [
  "Contact: mailto:hello@frederickradius.app?subject=Frederick%20Radius%20security%20report",
  "Canonical: https://frederickradius.app/.well-known/security.txt",
  "Preferred-Languages: en",
  "Expires: 2027-07-14T00:00:00.000Z",
  "",
].join("\n");

export function GET(): Response {
  return new Response(BODY, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
