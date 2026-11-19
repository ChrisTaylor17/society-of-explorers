export type RelayLifecycle = "clear" | "refresh" | "leave";

/**
 * Background and inactive clear the held relay. Foreground may refresh.
 * Refresh is a read. It does not resend a pending or ambiguous write.
 */
export function relayLifecycleForAppActivity(state: string): RelayLifecycle {
  if (state === "background" || state === "inactive") return "clear";
  if (state === "active") return "refresh";
  return "leave";
}
