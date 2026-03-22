import { generateNonce } from 'siwe'
import { NextResponse } from 'next/server'
export async function GET() {
  return NextResponse.json({ nonce: generateNonce() })
}
