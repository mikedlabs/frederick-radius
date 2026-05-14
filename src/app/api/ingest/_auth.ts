import { NextResponse } from "next/server";

export function verifyCronAuth(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");

  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
