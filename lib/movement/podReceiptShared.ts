import { stableStringify } from '@/lib/movement/podSync';

export const POD_SEAL_RECEIPT_KIND = 'society-of-explorers.pod-seal-receipt';
export const POD_SEAL_RECEIPT_VERSION = 1;

export interface PodSealReceipt {
  kind: typeof POD_SEAL_RECEIPT_KIND;
  receipt_version: typeof POD_SEAL_RECEIPT_VERSION;
  issued_at: string;
  subject: {
    member_id_hash: string;
    wallet_address_hash: string | null;
  };
  pod: {
    commitment_hash: string | null;
    committed_at: string | null;
    updated_at: string | null;
    pod_version: number | null;
    sync_version: number | null;
    sync_status: string | null;
    sync_client_updated_at: string | null;
    sync_device_id_hash: string | null;
    sync_conflict_count: number;
    ciphertext_bytes: number;
  };
  custody: {
    key_mode: string;
    custody_status: string;
    sovereignty_status: string;
    custody_verification: string;
    attestation: string | null;
    key_derivation: string | null;
    key_exportable: boolean | null;
    server_can_decrypt_pod: boolean | null;
    wallet_signature_stored: boolean | null;
  };
  hashes: {
    wallet_key_message_hash: string | null;
    wallet_signature_hash: string | null;
  };
  privacy: {
    includes_ciphertext: false;
    includes_plaintext: false;
    includes_raw_wallet_address: false;
    includes_raw_wallet_signature: false;
    includes_raw_member_identifier: false;
    note: string;
  };
  verification: {
    receipt_hash_format: 'sha256:pod-seal-receipt-v1-canonical-json';
    full_pod_verifier_route: '/movement/pod/verify';
    full_pod_export_route: '/api/movement/pod/export';
    receipt_can_verify_ciphertext: false;
    full_pod_export_required_for_ciphertext_verification: true;
  };
  receipt_hash: string;
}

export function canonicalPodSealReceiptInput(receipt: Omit<PodSealReceipt, 'receipt_hash'>): string {
  return stableStringify(receipt);
}
