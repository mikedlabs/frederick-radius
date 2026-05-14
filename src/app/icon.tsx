import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "#C4451C", borderRadius: 8,
        }}
      >
        <div
          style={{
            width: 14, height: 14, borderRadius: 999, border: "3px solid white",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div style={{ width: 4, height: 4, borderRadius: 999, background: "white" }} />
        </div>
      </div>
    ),
    size,
  );
}
