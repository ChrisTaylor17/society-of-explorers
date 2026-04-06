/**
 * Frequency Matching System
 *
 * Computes multi-dimensional coherence profiles from biometric and activity
 * signals, then matches explorers by cosine similarity across their vectors.
 */

export interface CoherenceInput {
  /** EEG alpha/theta ratio (typical range 0.5–4.0, higher = more focused calm) */
  alphaTheta: number;
  /** HRV 0.1 Hz power in ms² (typical 0–5000, higher = better autonomic coherence) */
  hrvPower: number;
  /** Total completed salon / seminar sessions */
  sessionCount: number;
  /** Total verified world-layer scans */
  scanCount: number;
}

export interface FrequencyVector {
  /** Normalised dimensions (each 0–1) */
  focus: number;
  coherence: number;
  engagement: number;
  exploration: number;
  /** Raw magnitude before normalisation */
  magnitude: number;
}

export interface MatchResult {
  memberId: string;
  displayName: string;
  similarity: number;
  vector: FrequencyVector;
  tags: string[];
}

/* ── helpers ─────────────────────────────────────────────── */

/** Clamp a value between 0 and 1. */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Sigmoid-style normaliser: maps [0, ∞) → (0, 1) with midpoint at `mid`. */
function sigmoid(value: number, mid: number): number {
  return value / (value + mid);
}

/* ── core ────────────────────────────────────────────────── */

/**
 * Compute a normalised frequency profile from raw coherence scores.
 *
 * Each dimension is mapped to 0–1:
 *   focus       – alpha/theta ratio   (midpoint 2.0)
 *   coherence   – HRV 0.1 Hz power    (midpoint 1500 ms²)
 *   engagement  – session count        (midpoint 30)
 *   exploration – scan count           (midpoint 20)
 */
export function computeFrequencyProfile(input: CoherenceInput): FrequencyVector {
  const focus = clamp01(sigmoid(Math.max(0, input.alphaTheta), 2.0));
  const coherence = clamp01(sigmoid(Math.max(0, input.hrvPower), 1500));
  const engagement = clamp01(sigmoid(Math.max(0, input.sessionCount), 30));
  const exploration = clamp01(sigmoid(Math.max(0, input.scanCount), 20));

  const magnitude = Math.sqrt(
    focus ** 2 + coherence ** 2 + engagement ** 2 + exploration ** 2,
  );

  return { focus, coherence, engagement, exploration, magnitude };
}

/**
 * Cosine similarity between two frequency vectors.
 * Returns a value in [-1, 1]; higher means more aligned.
 */
export function cosineSimilarity(a: FrequencyVector, b: FrequencyVector): number {
  const dot =
    a.focus * b.focus +
    a.coherence * b.coherence +
    a.engagement * b.engagement +
    a.exploration * b.exploration;

  if (a.magnitude === 0 || b.magnitude === 0) return 0;
  return dot / (a.magnitude * b.magnitude);
}

/**
 * Derive human-readable interest tags from a frequency vector.
 */
export function deriveTags(v: FrequencyVector): string[] {
  const tags: string[] = [];
  if (v.focus >= 0.6) tags.push('Deep Focus');
  if (v.focus < 0.3) tags.push('Open Awareness');
  if (v.coherence >= 0.6) tags.push('High Coherence');
  if (v.coherence >= 0.4 && v.coherence < 0.6) tags.push('Building Coherence');
  if (v.engagement >= 0.6) tags.push('Salon Regular');
  if (v.engagement >= 0.3 && v.engagement < 0.6) tags.push('Active Learner');
  if (v.exploration >= 0.6) tags.push('World Scanner');
  if (v.exploration >= 0.3 && v.exploration < 0.6) tags.push('Emerging Explorer');
  if (v.focus >= 0.5 && v.coherence >= 0.5) tags.push('Philosopher');
  if (v.engagement >= 0.5 && v.exploration >= 0.5) tags.push('Polymath');
  return tags;
}
