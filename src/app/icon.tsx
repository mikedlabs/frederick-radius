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
          background: "#16352B", borderRadius: 8,
        }}
      >
        <div
          style={{
            width: 14, height: 14, borderRadius: 999, border: "3px solid #EEE6D4",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div style={{ width: 5, height: 5, borderRadius: 999, background: "#E14328" }} />
        </div>
      </div>
    ),
    size,
  );
}
