import { NextResponse } from "next/server";
import {
  buildCategoryPageModel,
  CATEGORY_CACHE_CONTROL,
  CATEGORY_INITIAL_PAGE_SIZE,
  isBrowsableCategorySlug,
  resolveCategoryRankingContext,
} from "@/lib/category/browse";
export const dynamic = "force-dynamic";

function parseOffset(raw: string | null): number {
  const value = Number(raw ?? "0");
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function parseLimit(raw: string | null): number {
  const value = Number(raw ?? String(CATEGORY_INITIAL_PAGE_SIZE));
  if (!Number.isFinite(value)) return CATEGORY_INITIAL_PAGE_SIZE;
  return Math.max(1, Math.min(48, Math.floor(value)));
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 6);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!isBrowsableCategorySlug(slug)) {
    return NextResponse.json(
      { error: "unknown-category" },
      { status: 404, headers: { "Cache-Control": "public, s-maxage=60" } },
    );
  }

  const url = new URL(request.url);
  const ranking = resolveCategoryRankingContext(
    url.searchParams.get("scope"),
    url.searchParams.get("home"),
  );
  const model = buildCategoryPageModel(slug, ranking, {
    offset: parseOffset(url.searchParams.get("offset")),
    limit: parseLimit(url.searchParams.get("limit")),
    tags: parseTags(url.searchParams.get("tags")),
  });

  if (!model) {
    return NextResponse.json(
      { error: "unknown-category" },
      { status: 404, headers: { "Cache-Control": "public, s-maxage=60" } },
    );
  }

  return NextResponse.json(model, {
    headers: { "Cache-Control": CATEGORY_CACHE_CONTROL },
  });
}
