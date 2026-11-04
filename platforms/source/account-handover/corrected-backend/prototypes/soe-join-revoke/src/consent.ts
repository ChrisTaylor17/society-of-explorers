export type GrantStatus = "active" | "revoked";

export type ContactGrant = {
  grantorId: string;
  granteeId: string;
  scope: string;
  resourceId: string;
  status: GrantStatus;
};

export type InvitationStatus = "invited" | "accepted" | "declined";

export type Disclosure = {
  visible: boolean;
  reason: string;
};

function activeContact(
  grants: ContactGrant[],
  grantorId: string,
  granteeId: string,
  planId: string,
): boolean {
  return grants.some(
    (g) =>
      g.grantorId === grantorId &&
      g.granteeId === granteeId &&
      g.scope === "contact" &&
      g.resourceId === planId &&
      g.status === "active",
  );
}

function revokedContact(
  grants: ContactGrant[],
  grantorId: string,
  granteeId: string,
  planId: string,
): boolean {
  return grants.some(
    (g) =>
      g.grantorId === grantorId &&
      g.granteeId === granteeId &&
      g.scope === "contact" &&
      g.resourceId === planId &&
      g.status === "revoked",
  );
}

/**
 * Mutual consent for one plan. Either side's revocation hides the relay
 * immediately, even if the other grant is still active.
 */
export function contactDisclosure(input: {
  viewerId: string;
  otherId: string;
  planId: string;
  invitationStatus: InvitationStatus;
  grants: ContactGrant[];
}): Disclosure {
  const { viewerId, otherId, planId, invitationStatus, grants } = input;
  if (viewerId === otherId) {
    return { visible: false, reason: "That is your own relay." };
  }
  if (invitationStatus === "declined") {
    return { visible: false, reason: "They declined the plan. No relay is shared." };
  }
  if (invitationStatus !== "accepted") {
    return { visible: false, reason: "They have not accepted the plan yet." };
  }

  const mine = activeContact(grants, viewerId, otherId, planId);
  const theirs = activeContact(grants, otherId, viewerId, planId);
  const iRevoked = revokedContact(grants, viewerId, otherId, planId);

  if (mine && theirs) {
    return {
      visible: true,
      reason: "Both of you accepted. The relay handle is visible.",
    };
  }
  if (!mine && iRevoked && theirs) {
    return {
      visible: false,
      reason: "You revoked contact, so the relay is hidden even though they had accepted.",
    };
  }
  if (!mine && iRevoked) {
    return { visible: false, reason: "You revoked contact. The relay is hidden." };
  }
  if (!mine && theirs) {
    return {
      visible: false,
      reason: "They accepted disclosure. It stays hidden until you accept too.",
    };
  }
  if (mine && !theirs) {
    return {
      visible: false,
      reason: "You accepted disclosure. It stays hidden until they accept too.",
    };
  }
  return {
    visible: false,
    reason: "Contact stays hidden until both of you accept disclosure.",
  };
}

export function agentAllows(
  grants: ContactGrant[],
  agentId: string,
  scope: string,
): boolean {
  return grants.some(
    (g) =>
      g.granteeId === agentId &&
      g.scope === scope &&
      g.resourceId === "" &&
      g.status === "active",
  );
}
