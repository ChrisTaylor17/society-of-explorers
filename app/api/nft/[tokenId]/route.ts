import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tokenId: string }> }
) {
  const { tokenId } = await params;

  const svg = `<svg width="400" height="400" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg"><rect width="400" height="400" fill="#111827"/><text x="200" y="170" font-family="serif" font-size="32" fill="#f59e0b" text-anchor="middle">SOCIETY</text><text x="200" y="210" font-family="serif" font-size="32" fill="#f59e0b" text-anchor="middle">ARTIFACT</text><text x="200" y="270" font-family="monospace" font-size="18" fill="#67e8f9" text-anchor="middle">#${tokenId}</text><text x="200" y="310" font-family="sans-serif" font-size="14" fill="#a3a3a3" text-anchor="middle">Base Sepolia</text></svg>`;

  const metadata = {
    name: `Society Artifact #${tokenId}`,
    description: "A unique on-chain artifact minted by a member of the Society of Explorers.",
    image: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    attributes: [
      { trait_type: "Rarity", value: "Common" },
      { trait_type: "Type", value: "Explorer" }
    ]
  };

  return NextResponse.json(metadata);
}
