import type { MobileClient } from "./client.ts";
import type { ScreenAction, ScreenModel } from "./types.ts";

/**
 * One fresh key per user write. Reconciliation keeps the key stored on the
 * unresolved screen action and does not mint another one.
 */
export function createShellActions(client: MobileClient, intentScope = "") {
  let joins = 0;
  let grants = 0;
  let revokes = 0;
  const key = (endpoint: string, serial: number) => `${intentScope ? `${intentScope}:` : ""}shell-${endpoint}-${serial}`;

  function requestJoin(planId: string): Promise<ScreenModel> {
    joins += 1;
    return client.requestJoin(planId, key("join", joins));
  }

  function acceptDisclosure(): Promise<ScreenModel> {
    grants += 1;
    return client.acceptDisclosure(key("grant", grants));
  }

  function revokeContact(): Promise<ScreenModel> {
    revokes += 1;
    return client.revokeContact(key("revoke", revokes));
  }

  function reconcile(action: ScreenAction): Promise<ScreenModel> {
    if (!action.endpoint || !action.idempotencyKey) return Promise.resolve(client.screen());
    return client.reconcile(action.endpoint, action.idempotencyKey);
  }

  function run(action: ScreenAction, planId: string): Promise<ScreenModel> | null {
    if (!action.enabled) return null;
    if (action.id === "join") return requestJoin(planId);
    if (action.id === "accept") return acceptDisclosure();
    if (action.id === "revoke") return revokeContact();
    if (action.id === "reconcile") return reconcile(action);
    return null;
  }

  return { requestJoin, acceptDisclosure, revokeContact, reconcile, run };
}
