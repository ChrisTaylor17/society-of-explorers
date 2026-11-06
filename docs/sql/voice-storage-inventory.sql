-- Capture only in an approved read-only export or isolated restore transaction.
-- The result contains object keys. Write it to private recovery storage.
SET LOCAL search_path = pg_catalog;
SET LOCAL row_security = off;
SET LOCAL statement_timeout = '90s';
SET LOCAL lock_timeout = '5s';

DO $guard$
BEGIN
  IF current_setting('transaction_read_only') <> 'on'
    OR current_setting('transaction_isolation') <> 'repeatable read' THEN
    RAISE EXCEPTION 'A repeatable-read, read-only snapshot is required.';
  END IF;
END;
$guard$;

WITH bucket AS (
  SELECT * FROM storage.buckets WHERE id = 'waddles'
), objects AS (
  SELECT o.name AS key,
    coalesce(o.metadata->>'size', o.metadata->>'contentLength') AS size_text,
    o.metadata->>'mimetype' AS mime,
    o.metadata->>'contentEncoding' AS encoding,
    (to_jsonb(o)->>'archived_at' IS NOT NULL OR to_jsonb(o)->>'is_versioned' = 'true'
      OR to_jsonb(o)->>'is_delete_marker' = 'true') IS TRUE AS has_history
  FROM storage.objects o WHERE o.bucket_id = 'waddles'
)
SELECT jsonb_build_object(
  'format', 'soe-voice-storage-inventory-v1',
  'bucket', (SELECT jsonb_build_object('id', b.id, 'public', b.public, 'fileSizeLimit', b.file_size_limit,
                                      'allowedMimeTypes', b.allowed_mime_types)
             FROM bucket b),
  'hasVersionHistory', coalesce((SELECT to_jsonb(b)->>'versioning_status' FROM bucket b), 'DISABLED') <> 'DISABLED'
                       OR coalesce((SELECT bool_or(has_history) FROM objects), false),
  'objects', (SELECT coalesce(jsonb_agg(jsonb_build_object(
    'key', key,
    'bytes', CASE WHEN size_text ~ '^(0|[1-9][0-9]{0,18})$' THEN size_text::numeric END,
    'contentType', mime,
    'contentEncoding', encoding
  ) ORDER BY key COLLATE "C"), '[]'::jsonb) FROM objects)
);
