import { DEMO_BANNER, DEMO_LABEL, REVOCATION_LIMIT } from "./copy.ts";
import { payloadHash } from "./hash.ts";
import { WriteLedger, type LedgerEntry } from "./ledger.ts";
import { RelayMemory } from "./memory.ts";
import { planMetadata, validLookup, validRead, validVersion, validWrite } from "./validation.ts";
import type { MeridianPort } from "./port.ts";
import type {
  DiscoverCard,
  Fact,
  Phase,
  PlanSnapshot,
  ScreenAction,
  ScreenModel,
  Truthful,
  VisibilityReview,
  WriteResult,
} from "./types.ts";

const EMPTY_RELAY = {
  state: "withheld" as const,
  value: null,
  note: "No relay is on screen.",
};

function screenBase(input: {
  phase: Phase;
  truthful: Truthful;
  eyebrow: string;
  title: string;
  lede: string;
  facts: Fact[];
  relay: ScreenModel["relay"];
  actions: ScreenAction[];
  blockers?: string[];
}): ScreenModel {
  return {
    phase: input.phase,
    demoLabel: DEMO_LABEL,
    banner: DEMO_BANNER,
    eyebrow: input.eyebrow,
    title: input.title,
    lede: input.lede,
    facts: input.facts,
    relay: input.relay,
    revocationNote: REVOCATION_LIMIT,
    truthful: input.truthful,
    actions: input.actions,
    blockers: input.blockers ?? [],
  };
}

/**
 * Adult journey controller for one device session.
 * Writes go through the ledger. Pending and ambiguous results stay put.
 */
export class MobileClient {
  private readonly ledger = new WriteLedger();
  private readonly memory = new RelayMemory();
  private readonly highWater = new Map<string, number>();
  /** An observed access denial also rejects contradictory success at that version. */
  private readonly deniedThrough = new Map<string, number>();
  private gate: Promise<void> = Promise.resolve();
  private online = true;
  /** A recognized expiry is terminal for this controller/token. */
  private sessionExpired = false;
  /** Bumped when the device goes offline so an in-flight read cannot be applied later. */
  private readEpoch = 0;
  /** Bumped when the held relay is released. Stays ahead of authorizedEpoch until foreground. */
  private relayEpoch = 0;
  /** A read may hold contact only when this still equals relayEpoch. */
  private authorizedEpoch = 0;
  private refreshFault: "stale" | "rejected" = "stale";
  private phase: Phase = "loading";
  private cards: DiscoverCard[] = [];
  private review: VisibilityReview | null = null;
  private plan: PlanSnapshot | null = null;
  private openPlanId: string | null = null;
  private note = "";
  private blockers: string[] = [];

  constructor(private readonly port: MeridianPort) {}

  setOnline(online: boolean): void {
    if (!online && this.online) this.readEpoch += 1;
    this.online = online;
    if (!online) {
      this.phase = "offline";
      this.memory.clear();
    }
  }

  heldRelay(): string | null {
    return this.memory.current();
  }

  /**
   * Background or inactive. Clears the relay and keeps later reads, including
   * the plan read after an in-flight write, from putting it back.
   */
  releaseRelay(): ScreenModel {
    this.relayEpoch += 1;
    this.memory.clear();
    return this.screen();
  }

  ledgerEntries() {
    return this.ledger.all();
  }

  boot(): Promise<ScreenModel> {
    this.phase = "loading";
    return this.enqueue(() => this.readDiscover());
  }

  refresh(): Promise<ScreenModel> {
    return this.enqueueRead(false);
  }

  /**
   * Explicit foreground authorization. Contact may be held again only by the
   * read this schedules, and only if the app has not gone inactive again.
   * Queued reads and write follow-ups do not authorize themselves.
   */
  foregroundRefresh(): Promise<ScreenModel> {
    return this.enqueueRead(true);
  }

  private enqueueRead(authorize: boolean): Promise<ScreenModel> {
    this.phase = "loading";
    const seen = this.relayEpoch;
    return this.enqueue(async () => {
      if (authorize && this.relayEpoch === seen) this.authorizedEpoch = seen;
      if (this.openPlanId) return this.readPlan(this.openPlanId);
      return this.readDiscover();
    });
  }

  reviewPlan(planId: string): Promise<ScreenModel> {
    this.phase = "loading";
    return this.enqueue(() => this.readVisibility(planId));
  }

  requestJoin(planId: string, idempotencyKey: string): Promise<ScreenModel> {
    return this.enqueue(() =>
      this.submit({
        endpoint: "join",
        planId,
        key: idempotencyKey,
        payload: { planId },
        send: (hash) =>
          this.port.requestJoin({
            personId: this.port.viewerId,
            idempotencyKey,
            payloadHash: hash,
            body: { planId },
          }),
      }),
    );
  }

  acceptDisclosure(idempotencyKey: string): Promise<ScreenModel> {
    return this.enqueue(() => {
      const plan = this.plan;
      if (!plan?.other.canGrant) {
        this.note = "Disclosure is not available on the latest read.";
        return Promise.resolve(this.screen());
      }
      return this.submit({
        endpoint: "grant",
        planId: plan.id,
        key: idempotencyKey,
        payload: { planId: plan.id, otherId: plan.other.personId },
        send: (hash) =>
          this.port.acceptDisclosure({
            personId: this.port.viewerId,
            idempotencyKey,
            payloadHash: hash,
            body: { planId: plan.id, otherId: plan.other.personId },
          }),
      });
    });
  }

  revokeContact(idempotencyKey: string): Promise<ScreenModel> {
    // Invalidate an earlier in-flight read at user intent, before this queued
    // write can start. Otherwise that read could put contact back meanwhile.
    this.memory.clear();
    this.readEpoch += 1;
    return this.enqueue(() => {
      const plan = this.plan;
      const permissionId = plan?.other.myGrantId;
      if (!plan || !permissionId || !plan.other.canRevoke) {
        this.note = "There is no active contact grant to revoke.";
        return Promise.resolve(this.screen());
      }
      return this.submit({
        endpoint: "revoke",
        planId: plan.id,
        key: idempotencyKey,
        payload: { permissionId },
        send: (hash) =>
          this.port.revokeContact({
            personId: this.port.viewerId,
            idempotencyKey,
            payloadHash: hash,
            body: { permissionId },
          }),
      });
    });
  }

  /**
   * Asks whether the server stored this key. Does not send the write again.
   * An absent record leaves the pending or ambiguous outcome in place.
   */
  reconcile(endpoint: string, key: string): Promise<ScreenModel> {
    return this.enqueue(async () => {
      if (this.sessionExpired) return this.expire();
      const entry = this.ledger.find(endpoint, key);
      if (!entry || (entry.status !== "pending" && entry.status !== "ambiguous")) return this.screen();
      if (!this.online) {
        this.phase = "offline";
        this.memory.clear();
        return this.screen();
      }
      const found = await this.port.lookup({
        personId: this.port.viewerId,
        endpoint,
        key,
        payloadHash: entry.payloadHash,
      });
      if (!validLookup(found, endpoint)) {
        this.memory.clear();
        this.note = "The stored result was malformed. The earlier outcome stays unresolved.";
        return this.screen();
      }
      if (found.status === "recorded" && found.result.status === "committed") {
        entry.status = "committed";
        this.recordCommittedVersion(entry.planId, found.result.version);
        this.openPlanId = entry.planId;
        await this.readPlan(entry.planId);
        return this.screen();
      }
      if (found.status === "conflict") {
        entry.status = "conflict";
        entry.reason = found.error;
        this.note = found.error;
        return this.screen();
      }
      if (found.status === "unavailable") {
        this.blockers = [found.blocker];
        this.note = found.blocker;
        return this.screen();
      }
      this.note = "Still no stored result. The earlier outcome stands, and the write was not sent again.";
      return this.screen();
    });
  }

  screen(): ScreenModel {
    const relay = this.relayForScreen();
    const actions = this.actionsForScreen();
    if (this.phase === "loading") {
      return screenBase({
        phase: "loading",
        truthful: "loading",
        eyebrow: "Checking",
        title: "Loading the synthetic plan",
        lede: "Waiting on the adapter. Nothing has been confirmed yet.",
        facts: [],
        relay,
        actions,
      });
    }
    if (this.phase === "offline") {
      return screenBase({
        phase: "offline",
        truthful: "offline",
        eyebrow: "Offline",
        title: "This device is offline",
        lede: "No request was sent. A relay from an earlier read is not shown as current access.",
        facts: [],
        relay,
        actions,
      });
    }
    if (this.phase === "expired-session") {
      return screenBase({
        phase: "expired-session",
        truthful: "expired-session",
        eyebrow: "Session",
        title: "This demo session expired",
        lede: "Private relay text was cleared. The next read has to come from the server after a real sign-in. This screen does not collect a passcode.",
        facts: [],
        relay,
        actions,
        blockers: [this.note].filter(Boolean),
      });
    }
    if (this.phase === "live-blocked") {
      return screenBase({
        phase: "live-blocked",
        truthful: "failed-refresh",
        eyebrow: "Server boundary",
        title: "Live Meridian writes stay off",
        lede: "This build can name the existing routes. It does not sign in, and it does not post a participant change.",
        facts: [],
        relay,
        actions,
        blockers: this.blockers,
      });
    }
    if (this.phase === "failed-refresh") {
      const rejected = this.refreshFault === "rejected";
      return screenBase({
        phase: "failed-refresh",
        truthful: "failed-refresh",
        eyebrow: rejected ? "Refresh failed" : "Stale response",
        title: rejected ? "The refresh did not succeed" : (this.plan?.title ?? "Could not refresh"),
        lede: rejected
          ? "The read was rejected. The relay was cleared. This screen is not current access."
          : "A response older than the latest version was ignored. The relay was cleared. The title below is remembered history, not ongoing access.",
        facts: rejected || !this.plan ? [] : this.planFacts(this.plan),
        relay,
        actions,
      });
    }
    if (this.phase === "join-pending" || this.phase === "join-ambiguous") {
      const entry = this.openWrite();
      const noun = writeNoun(entry?.endpoint ?? "join");
      const pending = this.phase === "join-pending";
      return screenBase({
        phase: this.phase,
        truthful: pending ? "pending" : "unknown",
        eyebrow: pending ? "Not confirmed" : "Unknown",
        title: pending ? `${noun} still pending` : `${noun} not confirmed`,
        lede: pending
          ? "The write has no committed result. This screen does not call it a success, and it will not send it again on its own."
          : this.note ||
            "The request may have reached the server. The outcome stays unknown until a stored result is found. It will not be retried automatically.",
        facts: entry
          ? [
              { label: "Idempotency key", value: entry.key },
              { label: "Attempt", value: entry.attemptId },
              { label: "Recorded outcome", value: entry.status },
            ]
          : [],
        relay,
        actions,
      });
    }
    if (this.phase === "discover") {
      const card = this.cards[0];
      return screenBase({
        phase: "discover",
        truthful: "committed",
        eyebrow: "Discover",
        title: card?.title ?? "No synthetic plan",
        lede: card
          ? `${card.kindLabel} · ${card.whenLabel} · ${card.placeLabel}. Hosted by ${card.hostName}. Shared windows: ${card.sharedWindows.join(", ") || "none"}. Shared interests: ${card.sharedInterests.join(", ") || "none"}. Overlap on a fixture is not private set intersection.`
          : "The fixture returned no plan.",
        facts: card
          ? [
              { label: "Host", value: card.hostName },
              { label: "Place", value: card.placeLabel },
            ]
          : [],
        relay,
        actions,
      });
    }
    if (this.phase === "visibility" && this.review) {
      return screenBase({
        phase: "visibility",
        truthful: "committed",
        eyebrow: "Who may see what",
        title: this.review.title,
        lede: "Each row is what the adapter says is visible now. A relay is not on this screen.",
        facts: this.review.rows.map((row) => ({
          label: row.field,
          value: row.reason ? `${row.access}. ${row.reason}` : `${row.access}. ${row.audience}`,
        })),
        relay,
        actions,
        blockers: this.note ? [this.note] : [],
      });
    }
    if(this.phase==='withdrawn'&&this.plan){
      return screenBase({phase:'withdrawn',truthful:'committed',eyebrow:'Participation ended',title:'You have left this participation',lede:'This current read shows withdrawn participation. Future contact access is off. Stored history and copies already seen remain.',facts:[{label:'Plan',value:this.plan.title},{label:'Membership',value:'Withdrawn'},{label:'Joining again',value:'Requires a new request and fresh host acceptance'}],relay,actions});
    }
    if (this.phase === "revoked" && this.plan) {
      return screenBase({
        phase: "revoked",
        truthful: "committed",
        eyebrow: "Revoked",
        title: "Future contact access is off",
        lede: `${this.plan.other.contactReason} If ${this.plan.other.displayName} already saw the relay, this revoke does not reach that copy.`,
        facts: [
          ...this.plan.steps,
          { label: "Later reads", value: "Relay hidden" },
          { label: "Copies already seen", value: "Still with the person who saw them" },
        ],
        relay,
        actions,
      });
    }
    if (this.plan) {
      return screenBase({
        phase: "mutual",
        truthful: "committed",
        eyebrow: this.plan.contactAccess === "visible" ? "Mutual acceptance" : "Acceptance in progress",
        title: this.plan.title,
        lede: this.plan.other.contactReason,
        facts: this.plan.steps,
        relay,
        actions,
        blockers: this.note ? [this.note] : [],
      });
    }
    return screenBase({
      phase: this.phase,
      truthful: "unknown",
      eyebrow: "Synthetic demo",
      title: "Nothing to show",
      lede: this.note || "The adapter has not returned a plan.",
      facts: [],
      relay,
      actions,
      blockers: this.blockers,
    });
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.gate.then(fn, fn);
    this.gate = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async readDiscover(): Promise<ScreenModel> {
    return this.guardRead(null, () => this.port.discover(), (read) => {
      if (!validRead(read, "discover")) return this.failClosedRead(null);
      if (read.status === "rejected") return this.failClosedRead(null);
      if (read.status === "unavailable") return this.block(read.blocker);
      if (read.status === "expired-session") return this.expire();
      if (read.status === "offline") return this.goOffline();
      if (!this.keepVersion(`discover:${this.port.viewerId}`, read.version, null)) return this.screen();
      this.cards = read.data;
      this.phase = "discover";
      this.note = "";
      return this.screen();
    });
  }

  private async readVisibility(planId: string): Promise<ScreenModel> {
    return this.guardRead(planId, () => this.port.visibility(planId), (read) => {
      if (!validRead(read, "visibility", planId)) return this.failClosedRead(planId);
      if (read.status === "rejected") return this.observeDenial(planId, read.version);
      if (read.status === "unavailable") return this.block(read.blocker);
      if (read.status === "expired-session") return this.expire();
      if (read.status === "offline") return this.goOffline();
      if (!this.keepVersion(`plan:${planId}:${this.port.viewerId}`, read.version, planId)) return this.screen();
      this.review = read.data;
      this.openPlanId = planId;
      this.phase = this.phaseForOpenWrite(planId) ?? "visibility";
      if (this.openWriteForPlan(planId)?.endpoint === "revoke") this.memory.clear();
      return this.screen();
    });
  }

  private async readPlan(planId: string): Promise<ScreenModel> {
    return this.guardRead(planId, () => this.port.plan(planId), (read) => {
      if (!validRead(read, "plan", planId)) return this.failClosedRead(planId);
      if (read.status === "rejected") return this.observeDenial(planId, read.version);
      if (read.status === "unavailable") return this.block(read.blocker);
      if (read.status === "expired-session") return this.expire();
      if (read.status === "offline") return this.goOffline();
      if (!this.keepVersion(`plan:${planId}:${this.port.viewerId}`, read.version, planId)) return this.screen();
      this.applyPlan(read.data);
      return this.screen();
    });
  }

  /**
   * A read that started before offline, or that throws, must not restore a relay
   * or replace an unresolved write with a success screen. A relay released while
   * the read is in flight stays released.
   */
  private async guardRead<T>(
    planId: string | null,
    run: () => Promise<T>,
    apply: (value: T) => ScreenModel,
  ): Promise<ScreenModel> {
    if (this.sessionExpired) return this.expire();
    if (!this.online) {
      this.phase = "offline";
      this.memory.clear();
      return this.screen();
    }
    const epoch = this.readEpoch;
    const relayEpoch = this.relayEpoch;
    let value: T;
    try {
      value = await run();
    } catch {
      if (epoch !== this.readEpoch || !this.online) return this.discardStaleRead();
      return this.failClosedRead(planId);
    }
    if (epoch !== this.readEpoch || !this.online) return this.discardStaleRead();
    const applied = apply(value);
    if (relayEpoch !== this.relayEpoch) {
      this.memory.clear();
      return this.screen();
    }
    return applied;
  }

  private discardStaleRead(): ScreenModel {
    this.memory.clear();
    if (!this.online) {
      this.phase = "offline";
      return this.screen();
    }
    const open = this.openPlanId ? this.openWriteForPlan(this.openPlanId) : undefined;
    if (open) {
      this.phase = open.status === "pending" ? "join-pending" : "join-ambiguous";
      return this.screen();
    }
    if (this.phase === "loading") {
      this.refreshFault = "rejected";
      this.phase = "failed-refresh";
    }
    return this.screen();
  }

  private failClosedRead(planId: string | null): ScreenModel {
    this.memory.clear();
    const preserved = planId ? this.phaseForOpenWrite(planId) : undefined;
    if (preserved) {
      this.phase = preserved;
      return this.screen();
    }
    this.refreshFault = "rejected";
    this.phase = "failed-refresh";
    return this.screen();
  }

  private applyPlan(plan: PlanSnapshot): void {
    this.plan = planMetadata(plan);
    this.openPlanId = plan.id;
    const open = this.openWriteForPlan(plan.id);
    if (open) {
      if (open.endpoint === "revoke") this.memory.clear();
      else if (plan.contactAccess === "visible") this.holdRelay(plan.other.contact);
      else this.memory.clear();
      this.phase = open.status === "pending" ? "join-pending" : "join-ambiguous";
      return;
    }
    if (plan.contactAccess === "visible") this.holdRelay(plan.other.contact);
    else this.memory.clear();
    this.phase = this.phaseFromPlan(plan);
    this.note = "";
  }

  private keepVersion(resource: string, version: number, planId: string | null): boolean {
    const seen = this.highWater.get(resource) ?? 0;
    if (!validVersion(version) || version < seen || version <= (this.deniedThrough.get(resource) ?? 0)) {
      this.memory.clear();
      const preserved = planId ? this.phaseForOpenWrite(planId) : undefined;
      if (preserved) {
        this.phase = preserved;
        return false;
      }
      this.refreshFault = "stale";
      this.phase = "failed-refresh";
      return false;
    }
    this.highWater.set(resource, version);
    return true;
  }

  private observeDenial(planId: string, version: number): ScreenModel {
    if (!validVersion(version)) return this.failClosedRead(planId);
    const resource = `plan:${planId}:${this.port.viewerId}`;
    this.highWater.set(resource, Math.max(this.highWater.get(resource) ?? 0, version));
    this.deniedThrough.set(resource, Math.max(this.deniedThrough.get(resource) ?? 0, version));
    return this.failClosedRead(planId);
  }

  /** A confirmed mutation is also evidence that earlier plan reads are stale. */
  private recordCommittedVersion(planId: string, version: number): void {
    if (!validVersion(version)) throw new Error("Invalid committed version");
    const resource = `plan:${planId}:${this.port.viewerId}`;
    this.highWater.set(resource, Math.max(this.highWater.get(resource) ?? 0, version));
  }

  /** Contact text stays off this device until a foreground refresh authorizes it. */
  private holdRelay(relay: string | null): void {
    if (this.relayEpoch !== this.authorizedEpoch || !relay) {
      this.memory.clear();
      return;
    }
    this.memory.remember(relay);
  }

  private phaseForOpenWrite(planId: string): "join-pending" | "join-ambiguous" | undefined {
    const open = this.openWriteForPlan(planId);
    if (!open) return undefined;
    return open.status === "pending" ? "join-pending" : "join-ambiguous";
  }

  private async submit(input: {
    endpoint: string;
    planId: string;
    key: string;
    payload: unknown;
    send: (hash: string) => Promise<WriteResult<unknown>>;
  }): Promise<ScreenModel> {
    if (!this.online) {
      this.phase = "offline";
      this.memory.clear();
      return this.screen();
    }
    if (this.sessionExpired) return this.expire();
    const hash = payloadHash(input.payload);
    const open = this.ledger.openForPlan(input.endpoint, input.planId);
    if (open) {
      this.phase = open.status === "pending" ? "join-pending" : "join-ambiguous";
      this.note = "The earlier write is still unresolved. It was not sent again.";
      return this.screen();
    }
    const prior = this.ledger.find(input.endpoint, input.key);
    if (prior && prior.payloadHash !== hash) {
      this.note = "That idempotency key was already used for a different request. Nothing new was sent.";
      return this.screen();
    }
    if (prior?.status === "committed") {
      this.openPlanId = input.planId;
      await this.readPlan(input.planId);
      return this.screen();
    }
    const attemptId = `attempt:${input.endpoint}:${input.key}`;
    const entry: LedgerEntry = {
      personId: this.port.viewerId,
      endpoint: input.endpoint,
      key: input.key,
      planId: input.planId,
      payloadHash: hash,
      status: "pending",
      attemptId,
    };
    this.ledger.add(entry);
    if (input.endpoint === "revoke") this.memory.clear();
    this.phase = "join-pending";
    let result: WriteResult<unknown>;
    try {
      result = await input.send(hash);
    } catch {
      entry.status = "ambiguous";
      entry.reason = "The write failed in transit. It was not retried.";
      this.phase = "join-ambiguous";
      this.note = entry.reason;
      this.memory.clear();
      return this.screen();
    }
    if (!validWrite(result, input.endpoint)) {
      entry.status = "ambiguous";
      entry.reason = "The write response was malformed. Reconcile this key before any new intent.";
      this.phase = "join-ambiguous";
      this.note = entry.reason;
      this.memory.clear();
      return this.screen();
    }
    if (result.status === "committed") {
      entry.status = "committed";
      this.recordCommittedVersion(input.planId, result.version);
      this.openPlanId = input.planId;
      await this.readPlan(input.planId);
      return this.screen();
    }
    if (result.status === "pending") {
      entry.status = "pending";
      entry.attemptId = result.attemptId;
      this.phase = "join-pending";
      this.note = "The adapter has not committed this write.";
      return this.screen();
    }
    if (result.status === "ambiguous") {
      entry.status = "ambiguous";
      entry.attemptId = result.attemptId;
      entry.reason = result.reason;
      this.phase = "join-ambiguous";
      this.note = result.reason;
      this.memory.clear();
      return this.screen();
    }
    if (result.status === "conflict") {
      entry.status = "conflict";
      entry.reason = result.error;
      this.note = result.error;
      this.phase = this.plan ? this.phaseFromPlan(this.plan) : "visibility";
      return this.screen();
    }
    if (result.status === "expired-session") {
      this.ledgerDrop(entry);
      return this.expire();
    }
    if (result.status === "offline") return this.goOffline();
    if (result.status === "unavailable") {
      this.ledgerDrop(entry);
      return this.block(result.blocker);
    }
    entry.status = "rejected";
    entry.reason = result.error;
    this.note = result.error;
    this.phase = this.plan ? this.phaseFromPlan(this.plan) : "visibility";
    return this.screen();
  }

  private ledgerDrop(entry: { endpoint: string; key: string }): void {
    const found = this.ledger.find(entry.endpoint, entry.key);
    if (found && found.status === "pending") found.status = "rejected";
  }

  private phaseFromPlan(plan: PlanSnapshot): Phase {
    if(plan.invitationStatus==='withdrawn')return 'withdrawn';
    if (plan.contactAccess === "revoked") return "revoked";
    if (plan.invitationStatus === "none") return "visibility";
    return "mutual";
  }

  private block(blocker: string): ScreenModel {
    this.phase = "live-blocked";
    this.blockers = [blocker];
    this.memory.clear();
    return this.screen();
  }

  private expire(): ScreenModel {
    this.sessionExpired = true;
    this.phase = "expired-session";
    this.memory.clear();
    this.note = "Sign-in stays on the Meridian server. This client does not store a session token.";
    return this.screen();
  }

  private goOffline(): ScreenModel {
    this.phase = "offline";
    this.memory.clear();
    return this.screen();
  }

  private relayForScreen(): ScreenModel["relay"] {
    const showMemory = this.phase === "mutual" && this.plan?.contactAccess === "visible";
    if (showMemory && this.memory.current()) {
      return {
        state: "memory",
        value: this.memory.current(),
        note: "Held in memory for this authorized read. Not written to disk.",
      };
    }
    if (showMemory) {
      return {
        state: "withheld",
        value: null,
        note: "The relay is not held on this device. It was not written to disk.",
      };
    }
    if (this.phase === "revoked") {
      return {
        state: "hidden",
        value: null,
        note: "Hidden on later reads. A copy someone already saw is unchanged.",
      };
    }
    if (this.phase === "visibility" || this.phase === "discover" || this.phase === "mutual") {
      return {
        state: "hidden",
        value: null,
        note: this.plan?.other.contactReason ?? "Relay hidden until both people accept contact.",
      };
    }
    return EMPTY_RELAY;
  }

  private actionsForScreen(): ScreenAction[] {
    const writable = this.online && this.phase !== "loading" && this.phase !== "expired-session" && this.phase !== "live-blocked";
    const planId = this.cards[0]?.id ?? this.openPlanId ?? "";
    return [
      { id: "review", label: "Review who may see what", enabled: writable && this.phase === "discover" && Boolean(planId) },
      {
        id: "join",
        label: this.phase==='withdrawn'?'Request to join again':"Request to join",
        enabled: writable && (this.phase === "visibility"||this.phase==='withdrawn') && !this.ledger.openForPlan("join", planId),
      },
      {
        id: "reconcile",
        label: "Check for a stored result",
        enabled: writable && (this.phase === "join-pending" || this.phase === "join-ambiguous"),
        endpoint: this.openWrite()?.endpoint,
        idempotencyKey: this.openWrite()?.key,
      },
      {
        id: "accept",
        label: "Accept disclosure",
        enabled: writable && (this.phase === "mutual" || this.phase === "revoked") && Boolean(this.plan?.other.canGrant),
      },
      { id: "revoke", label: "Revoke future contact", enabled: writable && Boolean(this.plan?.other.canRevoke) && this.phase === "mutual" },
    ];
  }

  private openWrite() {
    return [...this.ledger.all()].reverse().find((entry) => entry.status === "pending" || entry.status === "ambiguous");
  }

  private openWriteForPlan(planId: string) {
    return [...this.ledger.all()].reverse().find(
      (entry) => entry.planId === planId && (entry.status === "pending" || entry.status === "ambiguous"),
    );
  }

  private planFacts(plan: PlanSnapshot): Fact[] {
    return [
      { label: "Last committed title", value: plan.title },
      { label: "Version held", value: String(plan.version) },
    ];
  }
}

export function createMobileClient(port: MeridianPort): MobileClient {
  return new MobileClient(port);
}

function writeNoun(endpoint: string): string {
  if (endpoint === "grant") return "Disclosure acceptance";
  if (endpoint === "revoke") return "Revoke";
  return "Join request";
}
