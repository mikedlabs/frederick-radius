import { NextResponse, type NextRequest } from "next/server";
import { BETA_COOKIE, betaToken } from "@/lib/beta-gate";

/** Only same-origin app paths are valid redirect targets (no open redirect). */
function safeNext(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/today";
}

/**
 * POST /api/beta — the beta unlock action. Verifies the submitted password
 * against BETA_PASSWORD; on success sets the httpOnly unlock cookie and
 * redirects to the originally requested page. On failure bounces back to /beta
 * with an error flag. 303 so the POST becomes a GET on redirect.
 */
export async function POST(req: NextRequest) {
  const pw = process.env.BETA_PASSWORD;
  const form = await req.formData().catch(() => null);
  const submitted = form ? String(form.get("password") ?? "") : "";
  const next = safeNext(form?.get("next"));

  if (!pw || submitted !== pw) {
    const back = new URL("/beta", req.url);
    back.searchParams.set("error", "1");
    back.searchParams.set("next", next);
    return NextResponse.redirect(back, { status: 303 });
  }

  const res = NextResponse.redirect(new URL(next, req.url), { status: 303 });
  res.cookies.set(BETA_COOKIE, await betaToken(pw), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
