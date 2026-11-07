import type { CodegenTypes, TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type MemberCapabilities = Readonly<{
  version: number; origin: string; storageKey: string; redirectPolicy: string;
  storagePolicy: string; storageGeneration: string; requestIdPolicy?: string;
  authPolicy?: string; providerOrigin?: string; publishableKey?: string; emailAuthPolicy?: string; emailCallbackUrl?: string; publicPolicy?: string; circleInvitePolicy?: string; readingPolicy?: string; profilePolicy?: string; publicProfilePolicy?: string; savedReadingPolicy?: string; attendancePolicy?: string; hostingPolicy?: string;
  circleAdmissionPolicy?: string; messageAiConsentPolicy?: string; messageReviewPolicy?: string; circleReviewPolicy?: string;
}>;
export type MemberRequest = Readonly<{ url: string; method: string; bearer: string; body?: string }>;
export type AuthRequest = Readonly<{ url: string; method: string; bearer?: string; body?: string }>;
export type PublicRequest = Readonly<{ url: string; method: string }>;
export type EmailPending = Readonly<{ flowId: string; purpose: string; email: string; challenge: string; redirectTo: string; createdAt: number; expiresAt: number; phase: string }>;
export type EmailClaim = Readonly<{ flowId: string; purpose: string; email: string; code: string; verifier: string; expiresAt: number }>;
export type EmailRequest = Readonly<{ flowId: string; url: string; method: string; bearer?: string; body?: string }>;
export type MemberResponse = Readonly<{ status: number; url: string; body: string; redirected: boolean }>;
export type MemberReset = Readonly<{ previousGeneration: string; generation: string; cleared: boolean }>;
export interface Spec extends TurboModule {
  capabilities(): Promise<MemberCapabilities>;
  begin(generation: string): Promise<string>;
  newRequestId(generation: string): Promise<string>;
  send(id: string, request: MemberRequest): Promise<MemberResponse>;
  sendReview(id: string, request: MemberRequest): Promise<MemberResponse>;
  sendCircleReview(id: string, request: MemberRequest): Promise<MemberResponse>;
  sendAuth(id: string, request: AuthRequest): Promise<MemberResponse>;
  prepareEmailLink(generation: string, purpose: string, email: string): Promise<EmailPending>;
  pendingEmailLink(generation: string): Promise<EmailPending | null>;
  claimEmailLink(generation: string, flowId: string): Promise<EmailClaim>;
  discardEmailLink(generation: string, flowId: string): Promise<void>;
  sendEmailAuth(id: string, request: EmailRequest): Promise<MemberResponse>;
  sendPublic(id: string, request: PublicRequest): Promise<MemberResponse>;
  cancel(id: string): Promise<void>;
  read(slot: string, generation: string): Promise<string | null>;
  write(slot: string, value: string, generation: string): Promise<void>;
  remove(slot: string, generation: string): Promise<void>;
  resetAccountStorage(expectedGeneration: string): Promise<MemberReset>;
  getConnectivitySnapshot(): string;
  readonly onConnectivityChange: CodegenTypes.EventEmitter<Readonly<{ state: string }>>;
}
// Missing module is an unavailable state, including iOS until separately built.
export default TurboModuleRegistry.get<Spec>('NativeSoeMember');
