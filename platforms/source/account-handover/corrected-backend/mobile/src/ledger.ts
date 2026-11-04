export type LedgerStatus = "pending" | "ambiguous" | "committed" | "conflict" | "rejected";

export type LedgerEntry = {
  personId: string;
  endpoint: string;
  key: string;
  planId: string;
  payloadHash: string;
  status: LedgerStatus;
  attemptId: string;
  reason?: string;
};

/**
 * Remembers non-idempotent writes on this device session.
 * Pending and ambiguous entries stay as recorded. They are not promoted to
 * success and they are not sent again.
 */
export class WriteLedger {
  private entries: LedgerEntry[] = [];

  all(): readonly LedgerEntry[] {
    return this.entries;
  }

  find(endpoint: string, key: string): LedgerEntry | undefined {
    return this.entries.find((entry) => entry.endpoint === endpoint && entry.key === key);
  }

  openForPlan(endpoint: string, planId: string): LedgerEntry | undefined {
    return this.entries.find(
      (entry) =>
        entry.endpoint === endpoint &&
        entry.planId === planId &&
        (entry.status === "pending" || entry.status === "ambiguous"),
    );
  }

  add(entry: LedgerEntry): void {
    this.entries.push(entry);
  }
}
