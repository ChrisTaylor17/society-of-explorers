import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: { tokenId: string } }
) {
  const tokenId = params.tokenId;

  const colors = ['#c9a84c', '#8ab0d8', '#7c9e8a', '#c4956a'];
  const types  = ['Explorer', 'Scholar', 'Thinker', 'Sage'];
  const names  = [
    "The Cartographer's Compass",
    'Scroll of First Principles',
    'The Dialectic Lens',
    "Aurelius's Meditations",
    "Einstein's Thought Notebook",
    "Plato's Cave Map",
    "The Stoic's Mirror",
    "The Seeker's Lantern",
  ];

  const id       = parseInt(tokenId, 10) || 0;
  const color    = colors[id % 4];
  const typeName = types[id % 4];
  const name     = names[id % 8];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  <defs>
    <radialGradient id="g" cx="50%" cy="45%" r="55%">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#0a0800" stop-opacity="1"/>
    </radialGradient>
  </defs>
  <rect width="400" height="400" fill="#0a0800"/>
  <rect width="400" height="400" fill="url(#g)"/>
  <rect x="12" y="12" width="376" height="376" fill="none" stroke="${color}" stroke-width="0.6" opacity="0.35"/>
  <rect x="20" y="20" width="360" height="360" fill="none" stroke="${color}" stroke-width="0.3" opacity="0.2"/>
  <circle cx="200" cy="158" r="72" fill="none" stroke="${color}" stroke-width="1"/>
  <circle cx="200" cy="158" r="52" fill="${color}" opacity="0.08"/>
  <text x="200" y="176" font-family="Georgia,serif" font-size="48" fill="${color}" text-anchor="middle">&#x2B21;</text>
  <text x="200" y="270" font-family="Georgia,serif" font-size="15" fill="${color}" text-anchor="middle" letter-spacing="0.5">${name}</text>
  <text x="200" y="296" font-family="Georgia,serif" font-size="9" fill="${color}" text-anchor="middle" opacity="0.55" letter-spacing="3">SOCIETY OF EXPLORERS</text>
  <text x="200" y="356" font-family="Georgia,serif" font-size="9" fill="${color}" text-anchor="middle" opacity="0.3" letter-spacing="2">${typeName} · #${tokenId}</text>
</svg>`;

  const metadata = {
    name: `${name} #${tokenId}`,
    description: `A rare artifact of the Society of Explorers - minted on Base Sepolia. Held by an Explorer who seeks truth across time.`,
    image: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    attributes: [
      { trait_type: 'Type',     value: typeName },
      { trait_type: 'Token ID', value: tokenId  },
    ],
  };

  return NextResponse.json(metadata, {
    headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
}
