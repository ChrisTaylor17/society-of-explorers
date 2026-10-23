import { buildPodPayload, getPodStats } from '@/lib/movement/pod';
import { buildMemoryConsentReadiness } from '@/lib/memory/consentActions';

function countArray(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function byteSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

export async function buildPodExportManifest(memberId: string) {
  const [payload, stats] = await Promise.all([
    buildPodPayload(memberId),
    getPodStats(memberId),
  ]);
  const memoryConsent = buildMemoryConsentReadiness();

  return {
    generatedAt: new Date().toISOString(),
    pod: {
      exists: stats.exists,
      encryptedSizeBytes: stats.size_bytes,
      version: stats.version,
      updatedAt: stats.updated_at,
      lastCommitmentHash: stats.last_commitment_hash,
      lastCommittedAt: stats.last_committed_at,
      syncVersion: stats.sync_version,
      syncStatus: stats.sync_status,
      syncConflictCount: stats.sync_conflict_count,
      keyMode: stats.key_mode,
      custodyStatus: stats.custody_status,
      sovereigntyStatus: stats.sovereignty_status,
      custodyVerification: stats.custody_verification,
    },
    sourceSnapshot: {
      generatedAt: payload.generated_at,
      estimatedPlaintextBytes: byteSize(payload),
      sections: [
        { id: 'member_profile', label: 'Member profile fields', count: payload.member ? 1 : 0 },
        { id: 'practice_responses', label: 'Practice responses', count: countArray(payload.practice_responses) },
        { id: 'practice_reflections', label: 'Practice reflections', count: countArray(payload.practice_reflections) },
        { id: 'conversation_summaries', label: 'Thinker conversation summaries', count: countArray(payload.thinker_conversation_summaries) },
        { id: 'semantic_memory', label: 'Active semantic memory facts', count: countArray(payload.semantic_memory) },
        { id: 'life_facts', label: 'Life fact keys', count: Object.keys(payload.life_facts || {}).length },
        { id: 'intellectual_interests', label: 'Intellectual interests', count: countArray(payload.intellectual_interests) },
      ],
    },
    memoryConsent: {
      ...memoryConsent,
      activeFactsIncluded: true,
      suppressedOrExpiredFactsIncluded: false,
      rawMemoryContentIncludedInManifest: false,
    },
    exportSafety: {
      rawPayloadIncluded: false,
      ciphertextIncluded: false,
      rawMemberIdIncluded: false,
      rawWalletAddressIncluded: false,
      rawWalletSignatureIncluded: false,
      externalActions: 'none',
      note:
        'This manifest previews export shape and counts only. Downloading the pod returns encrypted ciphertext; downloading the receipt returns proof metadata only.',
    },
  };
}
