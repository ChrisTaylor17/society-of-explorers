export type Truthful =
  | "pending"
  | "unknown"
  | "committed"
  | "failed-refresh"
  | "loading"
  | "offline"
  | "expired-session";

export type Phase =
  | "loading"
  | "offline"
  | "expired-session"
  | "discover"
  | "visibility"
  | "join-pending"
  | "join-ambiguous"
  | "mutual"
  | "revoked"
  | "withdrawn"
  | "failed-refresh"
  | "live-blocked";

export type Fact = { label: string; value: string };

export type RelayDisplay = {
  state: "hidden" | "memory" | "withheld";
  value: string | null;
  note: string;
};

export type ScreenAction = {
  id: string;
  label: string;
  enabled: boolean;
  endpoint?: string;
  idempotencyKey?: string;
};

export type ScreenModel = {
  phase: Phase;
  demoLabel: "Synthetic demo";
  banner: string;
  eyebrow: string;
  title: string;
  lede: string;
  facts: Fact[];
  relay: RelayDisplay;
  revocationNote: string;
  truthful: Truthful;
  actions: ScreenAction[];
  blockers: string[];
};

export type DiscoverCard = {
  id: string;
  version: number;
  title: string;
  kindLabel: string;
  whenLabel: string;
  placeLabel: string;
  hostName: string;
  sharedInterests: string[];
  sharedWindows: string[];
};

export type VisibilityRow = {
  field: string;
  audience: string;
  access: string;
  reason?: string;
};

export type VisibilityReview = {
  planId: string;
  version: number;
  title: string;
  rows: VisibilityRow[];
};

export type ContactAccess = "hidden" | "visible" | "revoked";

export type PlanSnapshot = {
  id: string;
  version: number;
  title: string;
  kindLabel: string;
  whenLabel: string;
  placeLabel: string;
  hostName: string;
  invitationStatus: "none" | "invited" | "accepted" | "declined" | "withdrawn";
  contactAccess: ContactAccess;
  steps: Fact[];
  other: {
    personId: string;
    displayName: string;
    contact: string | null;
    contactReason: string;
    myGrantId: string | null;
    canGrant: boolean;
    canRevoke: boolean;
  };
};

export type ReadResult<T> =
  | { status: "ok"; version: number; data: T }
  | { status: "rejected"; planId: string; version: number; error: string }
  | { status: "offline" }
  | { status: "expired-session" }
  | { status: "unavailable"; blocker: string };

export type WriteResult<T> =
  | { status: "committed"; version: number; data: T }
  | { status: "pending"; attemptId: string }
  | { status: "ambiguous"; attemptId: string; reason: string }
  | { status: "conflict"; error: string }
  | { status: "rejected"; error: string }
  | { status: "expired-session" }
  | { status: "offline" }
  | { status: "unavailable"; blocker: string };

export type LookupResult =
  | { status: "recorded"; result: WriteResult<unknown> }
  | { status: "absent" }
  | { status: "conflict"; error: string }
  | { status: "unavailable"; blocker: string };

export type IdempotentWrite<T> = {
  personId: string;
  idempotencyKey: string;
  payloadHash: string;
  body: T;
};
