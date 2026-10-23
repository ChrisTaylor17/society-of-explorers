import "server-only";

import type { AuthenticatedMember } from "@/lib/auth/session";

function operatorEmails(): Set<string> {
  return new Set(
    (process.env.SOE_ADMIN_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function hasPromptAtlasOperatorAccessConfig(): boolean {
  return operatorEmails().size > 0;
}

export function isPromptAtlasOperator(member: AuthenticatedMember): boolean {
  const email = member.email?.trim().toLowerCase();
  return Boolean(email && operatorEmails().has(email));
}
