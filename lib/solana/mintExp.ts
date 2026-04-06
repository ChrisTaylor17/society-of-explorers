/**
 * Solana $EXP Token Minting
 *
 * Uses Solana Token-2022 with NonTransferable extension.
 * This module handles minting soulbound $EXP tokens to member wallets.
 *
 * Requirements (install when ready to go live):
 *   npm install @solana/web3.js @solana/spl-token bs58
 *
 * Env vars:
 *   - SOLANA_RPC_URL (mainnet or devnet)
 *   - SOLANA_MINT_AUTHORITY_KEY (base58 private key)
 *   - SOLANA_EXP_MINT (Token-2022 mint address)
 *
 * The NonTransferable extension is set at mint creation time, making
 * all tokens soulbound at the protocol level. No custom program needed.
 */

/**
 * Check if Solana minting is configured and packages are installed.
 */
export function isSolanaMintingEnabled(): boolean {
  return !!(
    process.env.SOLANA_RPC_URL &&
    process.env.SOLANA_MINT_AUTHORITY_KEY &&
    process.env.SOLANA_EXP_MINT
  );
}

/**
 * Mint $EXP tokens to a member's wallet.
 *
 * Dynamically imports Solana packages so the build succeeds even
 * when @solana/web3.js is not yet installed.
 *
 * @param walletAddress - Solana wallet address (base58)
 * @param amount - Number of $EXP tokens to mint (whole tokens)
 * @param decimals - Token decimals (default 0)
 * @returns Transaction signature and amount, or null if not configured
 */
export async function mintExpToWallet(
  walletAddress: string,
  amount: number,
  decimals: number = 0,
): Promise<{ signature: string; amount: number } | null> {
  if (!isSolanaMintingEnabled()) return null;

  try {
    const {
      Connection,
      Keypair,
      PublicKey,
      Transaction,
      sendAndConfirmTransaction,
    } = await import('@solana/web3.js');

    const {
      createMintToInstruction,
      getAssociatedTokenAddressSync,
      createAssociatedTokenAccountInstruction,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
      getAccount,
    } = await import('@solana/spl-token');

    const bs58 = (await import('bs58')).default;

    const connection = new Connection(process.env.SOLANA_RPC_URL!, 'confirmed');
    const authority = Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_MINT_AUTHORITY_KEY!));
    const mint = new PublicKey(process.env.SOLANA_EXP_MINT!);
    const recipient = new PublicKey(walletAddress);

    // Get or create the associated token account (Token-2022)
    const ata = getAssociatedTokenAddressSync(
      mint,
      recipient,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    const tx = new Transaction();

    // Check if the ATA exists; if not, create it
    try {
      await getAccount(connection, ata, 'confirmed', TOKEN_2022_PROGRAM_ID);
    } catch {
      tx.add(
        createAssociatedTokenAccountInstruction(
          authority.publicKey,
          ata,
          recipient,
          mint,
          TOKEN_2022_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        ),
      );
    }

    // Mint tokens
    const mintAmount = BigInt(amount) * BigInt(10 ** decimals);
    tx.add(
      createMintToInstruction(
        mint,
        ata,
        authority.publicKey,
        mintAmount,
        [],
        TOKEN_2022_PROGRAM_ID,
      ),
    );

    const signature = await sendAndConfirmTransaction(connection, tx, [authority]);
    return { signature, amount };
  } catch (err) {
    console.error('Solana mint failed:', err);
    return null;
  }
}
