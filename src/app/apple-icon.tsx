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
          background: "#16352B",
        }}
      >
        <div
          style={{
            width: 80, height: 80, borderRadius: 999, border: "10px solid #EEE6D4",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div style={{ width: 26, height: 26, borderRadius: 999, background: "#E14328" }} />
        </div>
      </div>
    ),
    size,
  );
}
