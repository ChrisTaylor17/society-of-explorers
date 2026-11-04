import type {
  DiscoverCard,
  IdempotentWrite,
  LookupResult,
  PlanSnapshot,
  ReadResult,
  VisibilityReview,
  WriteResult,
} from "./types.ts";
import type { ReportBody, ReportReceipt } from "./report-contract.ts";
import type { DiscussionGateway } from "./shared/discussion.ts";
import type { ParticipationGateway } from './shared/participation.ts';

/**
 * Boundary the screens talk to.
 * The fixture adapter stands in for Meridian with synthetic people.
 * The HTTP adapter names the real routes and refuses participant writes.
 * Screens do not decide authorization; they render what a read returns.
 */
export interface MeridianPort {
  readonly name: "fixture" | "http-boundary";
  readonly writesEnabled: boolean;
  readonly viewerId: string;
  /** Same existing synthetic session; absent on production and offline adapters. */
  readonly discussion?: DiscussionGateway;
  readonly participation?: ParticipationGateway;
  /** Available only on the authenticated numeric-loopback synthetic adapter. */
  submitReport?(input: IdempotentWrite<ReportBody>): Promise<WriteResult<ReportReceipt>>;
  endSession?(): void;
  discover(): Promise<ReadResult<DiscoverCard[]>>;
  plan(planId: string): Promise<ReadResult<PlanSnapshot>>;
  visibility(planId: string): Promise<ReadResult<VisibilityReview>>;
  requestJoin(input: IdempotentWrite<{ planId: string }>): Promise<WriteResult<{ invitationId: string }>>;
  acceptDisclosure(
    input: IdempotentWrite<{ planId: string; otherId: string }>,
  ): Promise<WriteResult<{ permissionId: string }>>;
  revokeContact(input: IdempotentWrite<{ permissionId: string }>): Promise<WriteResult<{ permissionId: string }>>;
  lookup(input: {
    personId: string;
    endpoint: string;
    key: string;
    payloadHash: string;
  }): Promise<LookupResult>;
}
