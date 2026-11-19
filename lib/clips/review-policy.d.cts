import type { PublicMediaClip } from './contracts';

export type FilePin = { path: string; sha256: string; bytes: number };
export type ReviewContext = { territory: string | null; now?: number; requireNonExpiring?: boolean };
export type SourceReview = {
  source: FilePin; asset: FilePin; captions: FilePin; inspection: FilePin;
  firstParty: boolean; durationMs: number; territories: string[]; archiveSource?: FilePin;
};
export function reviewSource(value: unknown, context: ReviewContext): SourceReview | null;
export function reviewInspection(value: unknown, facts: unknown, context: ReviewContext): { attribution?: PublicMediaClip['attribution'] } | null;
export function captionTranscript(bytes: Uint8Array, duration: number): string | null;
export function mimeMatches(bytes: Uint8Array, mime: string): boolean;
