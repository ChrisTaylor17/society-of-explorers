-- ============================================================
-- EXPLORER MOVEMENT PHASE 4: DATA POD SYNC RESILIENCY
-- ============================================================

CREATE SCHEMA IF NOT EXISTS private;

ALTER TABLE data_pods
  ADD COLUMN IF NOT EXISTS sync_version bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sync_device_id text,
  ADD COLUMN IF NOT EXISTS sync_client_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS sync_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS sync_conflict_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_data_pods_sync_version
  ON data_pods(member_id, sync_version);

CREATE INDEX IF NOT EXISTS idx_data_pods_sync_client_updated_at
  ON data_pods(sync_client_updated_at DESC);

CREATE OR REPLACE FUNCTION private.sync_data_pod_v2(
  p_member_id uuid,
  p_ciphertext bytea,
  p_iv bytea,
  p_commitment_hash text,
  p_client_updated_at timestamptz,
  p_device_id text,
  p_base_sync_version bigint DEFAULT 0,
  p_payload_bytes integer DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_pod_version integer DEFAULT 2
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_row data_pods%ROWTYPE;
  current_found boolean := false;
  now_ts timestamptz := now();
  incoming_payload_bytes integer := COALESCE(p_payload_bytes, length(p_ciphertext));
  bounded_metadata jsonb := COALESCE(p_metadata, '{}'::jsonb);
  current_client_updated_at timestamptz;
  previous_sync_version bigint := 0;
  previous_commitment_hash text := NULL;
  next_sync_version bigint := 1;
  should_accept boolean := false;
  sync_reason text := 'accepted';
BEGIN
  IF p_member_id IS NULL THEN
    RAISE EXCEPTION 'member_id is required' USING ERRCODE = '22023';
  END IF;

  IF p_ciphertext IS NULL OR length(p_ciphertext) < 17 THEN
    RAISE EXCEPTION 'ciphertext must include AES-GCM payload and auth tag' USING ERRCODE = '22023';
  END IF;

  IF p_iv IS NULL OR length(p_iv) <> 12 THEN
    RAISE EXCEPTION 'iv must be 12 bytes for AES-256-GCM' USING ERRCODE = '22023';
  END IF;

  IF p_commitment_hash IS NULL OR lower(p_commitment_hash) !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'commitment_hash must be a 64-character sha256 hex digest' USING ERRCODE = '22023';
  END IF;

  IF p_client_updated_at IS NULL THEN
    RAISE EXCEPTION 'client_updated_at is required' USING ERRCODE = '22023';
  END IF;

  IF p_client_updated_at > now_ts + interval '15 minutes' THEN
    RAISE EXCEPTION 'client_updated_at is too far in the future' USING ERRCODE = '22023';
  END IF;

  IF p_base_sync_version IS NULL OR p_base_sync_version < 0 THEN
    RAISE EXCEPTION 'base_sync_version must be a non-negative integer' USING ERRCODE = '22023';
  END IF;

  IF p_pod_version IS NULL OR p_pod_version < 1 OR p_pod_version > 2 THEN
    RAISE EXCEPTION 'pod version must be 1 or 2' USING ERRCODE = '22023';
  END IF;

  IF p_device_id IS NULL
    OR length(trim(p_device_id)) = 0
    OR length(p_device_id) > 128
    OR p_device_id !~ '^[A-Za-z0-9._:-]+$'
  THEN
    RAISE EXCEPTION 'device_id must be 1-128 URL-safe identifier characters' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(bounded_metadata) <> 'object' THEN
    RAISE EXCEPTION 'metadata must be a JSON object' USING ERRCODE = '22023';
  END IF;

  IF incoming_payload_bytes <> length(p_ciphertext) THEN
    RAISE EXCEPTION 'payload_bytes does not match ciphertext length' USING ERRCODE = '22023';
  END IF;

  IF incoming_payload_bytes > 262144 THEN
    RAISE EXCEPTION 'ciphertext exceeds maximum sync payload size' USING ERRCODE = '54000';
  END IF;

  IF length(bounded_metadata::text) > 8192 THEN
    RAISE EXCEPTION 'metadata exceeds maximum sync metadata size' USING ERRCODE = '54000';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_member_id::text, 20260517));

  SELECT *
    INTO current_row
    FROM data_pods
    WHERE member_id = p_member_id
    FOR UPDATE;

  current_found := FOUND;

  IF NOT current_found THEN
    INSERT INTO data_pods (
      member_id,
      ciphertext,
      iv,
      version,
      last_commitment_hash,
      last_committed_at,
      updated_at,
      sync_version,
      sync_device_id,
      sync_client_updated_at,
      sync_metadata,
      sync_status,
      sync_conflict_count
    )
    VALUES (
      p_member_id,
      p_ciphertext,
      p_iv,
      2,
      lower(p_commitment_hash),
      now_ts,
      now_ts,
      1,
      p_device_id,
      p_client_updated_at,
      bounded_metadata,
      'accepted_initial',
      0
    );

    RETURN jsonb_build_object(
      'accepted', true,
      'status', 'accepted_initial',
      'sync_version', 1,
      'previous_sync_version', 0,
      'last_commitment_hash', lower(p_commitment_hash),
      'previous_commitment_hash', NULL,
      'client_updated_at', p_client_updated_at,
      'server_updated_at', now_ts,
      'conflict', false
    );
  END IF;

  previous_sync_version := COALESCE(current_row.sync_version, 0);
  previous_commitment_hash := current_row.last_commitment_hash;
  current_client_updated_at := COALESCE(
    current_row.sync_client_updated_at,
    current_row.last_committed_at,
    current_row.updated_at,
    '-infinity'::timestamptz
  );

  IF p_base_sync_version = previous_sync_version THEN
    should_accept := true;
    sync_reason := 'accepted';
  ELSIF p_base_sync_version > previous_sync_version THEN
    IF p_client_updated_at >= current_client_updated_at THEN
      should_accept := true;
      sync_reason := 'accepted_client_ahead';
    ELSE
      sync_reason := 'conflict_client_ahead_stale';
    END IF;
  ELSIF p_client_updated_at > current_client_updated_at THEN
    should_accept := true;
    sync_reason := 'accepted_lww';
  ELSIF p_client_updated_at = current_client_updated_at
    AND (
      p_device_id > COALESCE(current_row.sync_device_id, '')
      OR (
        p_device_id = COALESCE(current_row.sync_device_id, '')
        AND lower(p_commitment_hash) > COALESCE(current_row.last_commitment_hash, '')
      )
    )
  THEN
    should_accept := true;
    sync_reason := 'accepted_lww_tiebreak';
  ELSE
    sync_reason := 'conflict_stale';
  END IF;

  IF should_accept THEN
    next_sync_version := GREATEST(previous_sync_version + 1, p_base_sync_version + 1);

    UPDATE data_pods
      SET ciphertext = p_ciphertext,
          iv = p_iv,
          version = GREATEST(COALESCE(version, 1), p_pod_version, 2),
          last_commitment_hash = lower(p_commitment_hash),
          last_committed_at = now_ts,
          updated_at = now_ts,
          sync_version = next_sync_version,
          sync_device_id = p_device_id,
          sync_client_updated_at = p_client_updated_at,
          sync_metadata = bounded_metadata,
          sync_status = sync_reason
      WHERE member_id = p_member_id;

    RETURN jsonb_build_object(
      'accepted', true,
      'status', sync_reason,
      'sync_version', next_sync_version,
      'previous_sync_version', previous_sync_version,
      'last_commitment_hash', lower(p_commitment_hash),
      'previous_commitment_hash', previous_commitment_hash,
      'client_updated_at', p_client_updated_at,
      'server_updated_at', now_ts,
      'conflict', sync_reason <> 'accepted'
    );
  END IF;

  UPDATE data_pods
    SET sync_status = sync_reason,
        sync_conflict_count = sync_conflict_count + 1,
        sync_metadata = jsonb_set(
          COALESCE(sync_metadata, '{}'::jsonb),
          '{last_rejected_sync}',
          jsonb_build_object(
            'device_id', p_device_id,
            'base_sync_version', p_base_sync_version,
            'client_updated_at', p_client_updated_at,
            'commitment_hash', lower(p_commitment_hash),
            'rejected_at', now_ts,
            'reason', sync_reason
          ),
          true
        )
    WHERE member_id = p_member_id;

  RETURN jsonb_build_object(
    'accepted', false,
    'status', sync_reason,
    'sync_version', previous_sync_version,
    'previous_sync_version', previous_sync_version,
    'last_commitment_hash', previous_commitment_hash,
    'rejected_commitment_hash', lower(p_commitment_hash),
    'client_updated_at', p_client_updated_at,
    'server_updated_at', now_ts,
    'conflict', true
  );
END;
$$;

REVOKE ALL ON FUNCTION private.sync_data_pod_v2(
  uuid,
  bytea,
  bytea,
  text,
  timestamptz,
  text,
  bigint,
  integer,
  jsonb,
  integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.sync_data_pod_v2(
  uuid,
  bytea,
  bytea,
  text,
  timestamptz,
  text,
  bigint,
  integer,
  jsonb,
  integer
) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_data_pod_v2(
  p_member_id uuid,
  p_ciphertext bytea,
  p_iv bytea,
  p_commitment_hash text,
  p_client_updated_at timestamptz,
  p_device_id text,
  p_base_sync_version bigint DEFAULT 0,
  p_payload_bytes integer DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_pod_version integer DEFAULT 2
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
BEGIN
  RETURN private.sync_data_pod_v2(
    p_member_id,
    p_ciphertext,
    p_iv,
    p_commitment_hash,
    p_client_updated_at,
    p_device_id,
    p_base_sync_version,
    p_payload_bytes,
    p_metadata,
    p_pod_version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_data_pod_v2(
  uuid,
  bytea,
  bytea,
  text,
  timestamptz,
  text,
  bigint,
  integer,
  jsonb,
  integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_data_pod_v2(
  uuid,
  bytea,
  bytea,
  text,
  timestamptz,
  text,
  bigint,
  integer,
  jsonb,
  integer
) TO service_role;

NOTIFY pgrst, 'reload schema';
