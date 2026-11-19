import { ImageResponse } from "next/og";

export const alt = "Prompt Atlas by Society of Explorers";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "58px 68px",
        background: "#080c0e",
        color: "#eee7d9",
        fontFamily: "Georgia, serif",
        border: "1px solid #5f4f31",
      }}
    >
      <div style={{ display: "flex", color: "#d0aa62", fontSize: 20, letterSpacing: 7 }}>
        SOCIETY OF EXPLORERS
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ display: "flex", maxWidth: 800, fontSize: 76, lineHeight: 0.98 }}>
          Find a question worth following.
        </div>
        <div style={{ display: "flex", width: 70, height: 2, background: "#d0aa62" }} />
        <div style={{ display: "flex", fontFamily: "sans-serif", color: "#aaa49a", fontSize: 25 }}>
          Discover. Customize. Explore.
        </div>
      </div>
    </div>,
    size,
  );
}

