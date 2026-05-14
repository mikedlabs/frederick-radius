import { ImageResponse } from "next/og";
import { PLACE_BY_SLUG } from "@/data/places";
import { EVENT_BY_SLUG } from "@/data/events";
import { MUNICIPALITY_BY_SLUG } from "@/data/municipalities";
import { CATEGORY_BY_SLUG } from "@/data/categories";

export const runtime = "edge";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "site";
  const slug = url.searchParams.get("slug") ?? "";

  let title = "Frederick Radius";
  let kicker = "A smarter way to experience Frederick County";
  let accent = "#C4451C";

  if (type === "place") {
    const p = PLACE_BY_SLUG[slug];
    if (p) {
      title = p.name;
      kicker = `${CATEGORY_BY_SLUG[p.category]?.name ?? p.category} · ${p.city}, MD`;
      accent = CATEGORY_BY_SLUG[p.category]?.color ?? accent;
    }
  } else if (type === "event") {
    const e = EVENT_BY_SLUG[slug];
    if (e) {
      title = e.title;
      kicker = `${e.venue_name} · ${new Date(e.starts_at).toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" })}`;
      accent = CATEGORY_BY_SLUG[e.category]?.color ?? accent;
    }
  } else if (type === "municipality") {
    const m = MUNICIPALITY_BY_SLUG[slug];
    if (m) {
      title = m.name;
      kicker = `Frederick County, Maryland · pop. ${m.population.toLocaleString()}`;
    }
  } else if (type === "category") {
    const c = CATEGORY_BY_SLUG[slug];
    if (c) {
      title = c.name;
      kicker = "Across Frederick County";
      accent = c.color;
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background:
            "linear-gradient(135deg, #FAFAF7 0%, #F2F1EC 100%)",
          fontFamily: "system-ui",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 24,
            fontWeight: 600,
            color: accent,
            letterSpacing: -0.5,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              background: accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                background: "white",
              }}
            />
          </div>
          Frederick Radius
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 24,
              color: "#7A7975",
              letterSpacing: 1,
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            {kicker}
          </div>
          <div
            style={{
              fontSize: 88,
              fontWeight: 700,
              color: "#1A1A1A",
              letterSpacing: -2,
              lineHeight: 1,
            }}
          >
            {title}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            fontSize: 22,
            color: "#4A4A48",
          }}
        >
          <div>frederickradius.app</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#7A7975" }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: accent }} />
            {type === "place" ? "Place" : type === "event" ? "Event" : type === "municipality" ? "Town" : type === "category" ? "Category" : "Local discovery"}
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
