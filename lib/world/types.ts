export interface Space {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  host_id: string | null;
  space_type: 'salon' | 'library' | 'temple' | 'garden' | 'waypoint' | 'outpost';
  status: 'active' | 'archived' | 'pending';
  cover_url: string | null;
  total_scans: number;
  avg_quality: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ScanUpload {
  id: string;
  space_id: string;
  scanner_id: string | null;
  file_url: string;
  file_size: number | null;
  proof_hash: string;
  scan_type: 'photo' | 'lidar' | 'photogrammetry' | 'video' | 'audio';
  quality_score: number | null;
  verified: boolean;
  verified_by: string | null;
  verified_at: string | null;
  exp_awarded: number;
  is_first_scan: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface SpatialAnnotation {
  id: string;
  space_id: string;
  scan_id: string | null;
  author_id: string | null;
  content: string;
  annotation_type: 'note' | 'insight' | 'question' | 'story' | 'warning' | 'ritual';
  position_x: number | null;
  position_y: number | null;
  position_z: number | null;
  exp_awarded: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * Calculate EXP reward for a scan based on quality score.
 *
 * Quality tiers:
 *   40-59  → 10 EXP
 *   60-79  → 25 EXP
 *   80-94  → 40 EXP
 *   95-100 → 50 EXP
 *
 * Bonuses:
 *   First scan of a space → 2x multiplier
 *   Reputation bonus      → +5 to +35 based on lifetime scans
 */
export function calculateScanReward(
  qualityScore: number,
  isFirstScan: boolean,
  lifetimeScans: number,
): number {
  if (qualityScore < 40) return 0;

  let base: number;
  if (qualityScore >= 95) base = 50;
  else if (qualityScore >= 80) base = 40;
  else if (qualityScore >= 60) base = 25;
  else base = 10;

  if (isFirstScan) base *= 2;

  let reputationBonus = 0;
  if (lifetimeScans >= 100) reputationBonus = 35;
  else if (lifetimeScans >= 50) reputationBonus = 25;
  else if (lifetimeScans >= 25) reputationBonus = 15;
  else if (lifetimeScans >= 10) reputationBonus = 10;
  else if (lifetimeScans >= 5) reputationBonus = 5;

  return base + reputationBonus;
}
