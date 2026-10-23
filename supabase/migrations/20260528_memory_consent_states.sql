-- Memory consent states draft.
-- Local migration file only; do not apply to any Supabase project until Chris approves.
-- This extends the existing public.user_semantic_memory table and creates no new public
-- tables or functions.

ALTER TABLE public.user_semantic_memory
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS replacement_fact_id uuid,
  ADD COLUMN IF NOT EXISTS correction_note text,
  ADD COLUMN IF NOT EXISTS suppressed_at timestamptz,
  ADD COLUMN IF NOT EXISTS suppressed_reason text,
  ADD COLUMN IF NOT EXISTS last_member_reviewed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_semantic_memory_status_check'
  ) THEN
    ALTER TABLE public.user_semantic_memory
      ADD CONSTRAINT user_semantic_memory_status_check
      CHECK (status IN ('active', 'corrected', 'retracted', 'do_not_use', 'expired'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_semantic_memory_replacement_fact_id_fkey'
  ) THEN
    ALTER TABLE public.user_semantic_memory
      ADD CONSTRAINT user_semantic_memory_replacement_fact_id_fkey
      FOREIGN KEY (replacement_fact_id)
      REFERENCES public.user_semantic_memory(id)
      ON DELETE SET NULL
      DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;

UPDATE public.user_semantic_memory
SET
  status = 'expired',
  suppressed_at = COALESCE(suppressed_at, valid_until),
  suppressed_reason = COALESCE(suppressed_reason, 'legacy_valid_until_expiration')
WHERE valid_until IS NOT NULL
  AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_semantic_retrievable
  ON public.user_semantic_memory(member_id, category, confidence DESC, created_at DESC)
  WHERE valid_until IS NULL
    AND status = 'active'
    AND suppressed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_semantic_status_audit
  ON public.user_semantic_memory(member_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_semantic_replacement_fact
  ON public.user_semantic_memory(replacement_fact_id)
  WHERE replacement_fact_id IS NOT NULL;

COMMENT ON COLUMN public.user_semantic_memory.status IS
  'Consent/retrieval state: active, corrected, retracted, do_not_use, or expired.';

COMMENT ON COLUMN public.user_semantic_memory.replacement_fact_id IS
  'Replacement memory fact when a member corrects an older fact.';

COMMENT ON COLUMN public.user_semantic_memory.correction_note IS
  'Optional member/admin note explaining a correction or suppression.';

COMMENT ON COLUMN public.user_semantic_memory.suppressed_at IS
  'Timestamp after which this fact must not be used in AI retrieval or summaries.';

COMMENT ON COLUMN public.user_semantic_memory.suppressed_reason IS
  'Reason a fact was suppressed, retracted, corrected, or marked do_not_use.';

COMMENT ON COLUMN public.user_semantic_memory.last_member_reviewed_at IS
  'Last time the member explicitly reviewed this memory fact.';
