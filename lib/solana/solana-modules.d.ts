declare module '@solana/web3.js' {
  export class Connection { constructor(endpoint: string, commitment?: string); }
  export class Keypair { static fromSecretKey(key: Uint8Array): Keypair; publicKey: PublicKey; }
  export class PublicKey { constructor(key: string); }
  export class Transaction { add(...items: any[]): void; }
  export function sendAndConfirmTransaction(connection: any, transaction: any, signers: any[]): Promise<string>;
}

declare module '@solana/spl-token' {
  export function createMintToInstruction(mint: any, dest: any, authority: any, amount: bigint, multiSigners?: any[], programId?: any): any;
  export function getAssociatedTokenAddressSync(mint: any, owner: any, allowOwnerOffCurve?: boolean, programId?: any, associatedTokenProgramId?: any): any;
  export function createAssociatedTokenAccountInstruction(payer: any, ata: any, owner: any, mint: any, programId?: any, associatedTokenProgramId?: any): any;
  export function getAccount(connection: any, address: any, commitment?: string, programId?: any): Promise<any>;
  export const TOKEN_2022_PROGRAM_ID: any;
  export const ASSOCIATED_TOKEN_PROGRAM_ID: any;
}

declare module 'bs58' {
  const bs58: { decode(input: string): Uint8Array; encode(input: Uint8Array): string };
  export default bs58;
}
