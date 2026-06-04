import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "#A03A22",
        }}
      >
        <div
          style={{
            width: 80, height: 80, borderRadius: 999, border: "10px solid white",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div style={{ width: 24, height: 24, borderRadius: 999, background: "white" }} />
        </div>
      </div>
    ),
    size,
  );
}
