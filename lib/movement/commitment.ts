export interface PodCommitmentResult {
  hash: string;
  wroteOnchain: boolean;
  signature: string | null;
}

export async function writePodCommitment(
  memberId: string,
  commitmentHash: string,
): Promise<PodCommitmentResult> {
  if (process.env.MOVEMENT_ONCHAIN !== 'true') {
    console.log('[movement/commitment] MOVEMENT_ONCHAIN disabled; logging pod commitment', {
      memberId,
      commitmentHash,
    });
    return { hash: commitmentHash, wroteOnchain: false, signature: null };
  }

  console.log('[movement/commitment] on-chain writer not implemented yet', {
    memberId,
    commitmentHash,
  });
  return { hash: commitmentHash, wroteOnchain: false, signature: null };
}
