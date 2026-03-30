import { NextRequest, NextResponse } from "next/server";

const THINKERS = [
  { name: "Socrates",        symbol: "Σ", accent: "#C9A84C" },
  { name: "Plato",           symbol: "Π", accent: "#7B9FD4" },
  { name: "Nietzsche",       symbol: "N", accent: "#C0392B" },
  { name: "Marcus Aurelius", symbol: "M", accent: "#8E7CC3" },
  { name: "Einstein",        symbol: "E", accent: "#5DADE2" },
  { name: "Steve Jobs",      symbol: "J", accent: "#ABEBC6" },
];

function getThinker(tokenId: number) {
  return THINKERS[tokenId % THINKERS.length];
}

function buildSVG(tokenId: number): string {
  const { name, symbol, accent } = getThinker(tokenId);
  const bgId = `bg${tokenId}`;
  const glowId = `glow${tokenId}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400"><defs><radialGradient id="${bgId}" cx="50%" cy="40%" r="70%"><stop offset="0%" stop-color="#1a1209"/><stop offset="100%" stop-color="#0a0a0a"/></radialGradient><filter id="${glowId}"><feGaussianBlur stdDeviation="8" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><rect width="400" height="400" fill="url(#${bgId})"/><rect x="12" y="12" width="376" height="376" rx="4" fill="none" stroke="${accent}" stroke-width="1" opacity="0.6"/><rect x="20" y="20" width="360" height="360" rx="2" fill="none" stroke="${accent}" stroke-width="0.5" opacity="0.3"/><line x1="12" y1="40" x2="12" y2="12" stroke="${accent}" stroke-width="1.5" opacity="0.8"/><line x1="12" y1="12" x2="40" y2="12" stroke="${accent}" stroke-width="1.5" opacity="0.8"/><line x1="388" y1="40" x2="388" y2="12" stroke="${accent}" stroke-width="1.5" opacity="0.8"/><line x1="388" y1="12" x2="360" y2="12" stroke="${accent}" stroke-width="1.5" opacity="0.8"/><line x1="12" y1="360" x2="12" y2="388" stroke="${accent}" stroke-width="1.5" opacity="0.8"/><line x1="12" y1="388" x2="40" y2="388" stroke="${accent}" stroke-width="1.5" opacity="0.8"/><line x1="388" y1="360" x2="388" y2="388" stroke="${accent}" stroke-width="1.5" opacity="0.8"/><line x1="388" y1="388" x2="360" y2="388" stroke="${accent}" stroke-width="1.5" opacity="0.8"/><circle cx="200" cy="185" r="90" fill="${accent}" opacity="0.04"/><circle cx="200" cy="185" r="60" fill="${accent}" opacity="0.06"/><text x="200" y="220" font-family="Georgia,serif" font-size="110" text-anchor="middle" dominant-baseline="middle" fill="${accent}" opacity="0.95" filter="url(#${glowId})">${symbol}</text><line x1="60" y1="268" x2="340" y2="268" stroke="${accent}" stroke-width="0.5" opacity="0.4"/><text x="200" y="292" font-family="Georgia,serif" font-size="11" letter-spacing="4" text-anchor="middle" fill="${accent}" opacity="0.5">SOCIETY OF EXPLORERS</text><text x="200" y="322" font-family="Georgia,serif" font-size="22" letter-spacing="1" text-anchor="middle" fill="${accent}" opacity="0.9">${name}</text><text x="200" y="358" font-family="Courier New,monospace" font-size="10" letter-spacing="2" text-anchor="middle" fill="${accent}" opacity="0.35">#${String(tokenId).padStart(4,"0")}</text></svg>`;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tokenId: string }> }
) {
  const { tokenId: tokenIdStr } = await params;
  const tokenId = parseInt(tokenIdStr, 10);
  if (isNaN(tokenId) || tokenId < 0) {
    return NextResponse.json({ error: "Invalid token ID" }, { status: 400, headers: corsHeaders() });
  }
  const thinker = getThinker(tokenId);
  const svg = buildSVG(tokenId);
  const imageDataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.societyofexplorers.com";
  const metadata = {
    name: `Society of Explorers — ${thinker.name} #${tokenId}`,
    description: `A ritual artifact from the Society of Explorers. This token carries the wisdom of ${thinker.name}.`,
    image: imageDataUri,
    external_url: `${baseUrl}/salon`,
    attributes: [
      { trait_type: "Thinker",    value: thinker.name },
      { trait_type: "Token ID",   value: tokenId },
      { trait_type: "Collection", value: "Society of Explorers" },
      { trait_type: "Network",    value: "Base Sepolia" },
    ],
  };
  return NextResponse.json(metadata, {
    status: 200,
    headers: { ...corsHeaders(), "Cache-Control": "public, max-age=86400" },
  });
}
