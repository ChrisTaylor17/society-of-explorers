/**
 * In-memory hold for a relay the latest authorized read actually returned.
 * Nothing here is written to disk, localStorage, or a device keystore.
 */
export class RelayMemory {
  private value: string | null = null;

  remember(relay: string): void {
    this.value = relay;
  }

  clear(): void {
    this.value = null;
  }

  current(): string | null {
    return this.value;
  }
}
