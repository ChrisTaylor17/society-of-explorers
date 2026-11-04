import type { CodegenTypes, TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type MemberCapabilities = Readonly<{
  version: number; origin: string; storageKey: string; redirectPolicy: string;
  storagePolicy: string; storageGeneration: string; requestIdPolicy?: string;
  authPolicy?: string; providerOrigin?: string; publishableKey?: string;
}>;
export type MemberRequest = Readonly<{ url: string; method: string; bearer: string; body?: string }>;
export type AuthRequest = Readonly<{ url: string; method: string; bearer?: string; body?: string }>;
export type MemberResponse = Readonly<{ status: number; url: string; body: string; redirected: boolean }>;
export type MemberReset = Readonly<{ previousGeneration: string; generation: string; cleared: boolean }>;
export interface Spec extends TurboModule {
  capabilities(): Promise<MemberCapabilities>;
  begin(generation: string): Promise<string>;
  newRequestId(generation: string): Promise<string>;
  send(id: string, request: MemberRequest): Promise<MemberResponse>;
  sendAuth(id: string, request: AuthRequest): Promise<MemberResponse>;
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
