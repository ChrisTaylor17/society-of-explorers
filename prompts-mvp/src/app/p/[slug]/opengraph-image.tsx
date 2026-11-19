import { ImageResponse } from "next/og";
import {
  DEFAULT_SHARE_DESCRIPTION,
  findPublicPromptForShare,
} from "@/lib/prompts/share";

export const alt = "Prompt Atlas by Society of Explorers";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface PromptOpenGraphImageProps {
  params: Promise<{ slug: string }>;
}

function categoryLabel(category: string | undefined): string {
  if (!category) return "PROMPT ATLAS";
  return category.toUpperCase();
}

export default async function PromptOpenGraphImage({
  params,
}: PromptOpenGraphImageProps) {
  const { slug } = await params;
  const prompt = await findPublicPromptForShare(slug);
  const title = prompt?.title || "Find a question worth following.";
  const description = prompt?.description || DEFAULT_SHARE_DESCRIPTION;
  const signal = prompt
    ? `${prompt.usage_count.toLocaleString("en-US")} explorations`
    : "Discover, customize, explore";

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "54px 66px",
        background: "#080c0e",
        color: "#eee7d9",
        fontFamily: "Georgia, serif",
        border: "1px solid #5f4f31",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontFamily: "sans-serif",
          color: "#d0aa62",
          fontSize: 20,
          letterSpacing: 6,
        }}
      >
        <span>SOCIETY OF EXPLORERS</span>
        <span>{categoryLabel(prompt?.category)}</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 910 }}>
        <div
          style={{
            display: "flex",
            fontSize: title.length > 60 ? 58 : 72,
            lineHeight: 0.98,
            letterSpacing: -1,
          }}
        >
          {title}
        </div>
        <div style={{ display: "flex", width: 78, height: 2, background: "#d0aa62" }} />
        <div
          style={{
            display: "flex",
            maxWidth: 750,
            fontFamily: "sans-serif",
            color: "#cfc8ba",
            fontSize: 26,
            lineHeight: 1.35,
          }}
        >
          {description}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontFamily: "sans-serif",
          color: "#aaa49a",
          fontSize: 24,
        }}
      >
        <span>Prompt Atlas</span>
        <span>{signal}</span>
      </div>
    </div>,
    size,
  );
}
