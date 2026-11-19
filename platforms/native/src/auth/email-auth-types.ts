export type NativeEmailPurpose = 'signup' | 'recovery';
export type NativeEmailPending = {
  flowId: string; purpose: NativeEmailPurpose; email: string; challenge: string; redirectTo: string;
  createdAt: number; expiresAt: number; phase: 'waiting' | 'callback_ready' | 'callback_error';
};
export type NativeEmailClaim = { flowId: string; purpose: NativeEmailPurpose; email: string; code: string; verifier: string; expiresAt: number };
export type NativeEmailAuthPorts = {
  providerOrigin: string; callbackUrl: string;
  prepare(purpose: NativeEmailPurpose, email: string, signal: AbortSignal): Promise<NativeEmailPending>;
  pending(signal: AbortSignal): Promise<NativeEmailPending | null>;
  claim(flowId: string, signal: AbortSignal): Promise<NativeEmailClaim>;
  discard(flowId: string, signal: AbortSignal): Promise<void>;
  fetch(flowId: string, input: string, init: RequestInit): Promise<Response>;
  onRetired(listener: () => void): () => void;
};
