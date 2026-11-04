-- UNAPPLIED draft. Service-only legacy entitlement reconciliation, not new sales.
-- A trusted processor must verify the account, raw signature, canonical member
-- metadata, exact configured catalog, and complete current customer inventories.
-- No email/amount fallback; no supporter, native/session or customer-pointer writes.
BEGIN;
CREATE TABLE public.legacy_billing_members (
 member_id uuid NOT NULL REFERENCES public.members(id), mode text NOT NULL CHECK(mode IN ('test','live')),
 revision bigint NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740990),
 baseline_tier text, last_applied_tier text, external_change boolean NOT NULL DEFAULT false,
 needs_review boolean NOT NULL DEFAULT false, PRIMARY KEY(member_id,mode)
);
CREATE TABLE public.legacy_billing_customers (
 scope text NOT NULL CHECK(length(scope)<=100 AND scope ~ '^(test|live):acct_[A-Za-z0-9]+$'),
 customer_id text NOT NULL CHECK(length(customer_id)<=200 AND customer_id ~ '^cus_[A-Za-z0-9]+$'),
 member_id uuid NOT NULL, mode text NOT NULL, PRIMARY KEY(scope,customer_id),
 UNIQUE(scope,customer_id,member_id), CHECK(mode=split_part(scope,':',1)),
 FOREIGN KEY(member_id,mode) REFERENCES public.legacy_billing_members(member_id,mode)
);
CREATE TABLE public.legacy_billing_subscriptions (
 scope text NOT NULL, id text NOT NULL CHECK(length(id)<=200 AND id ~ '^sub_[A-Za-z0-9]+$'),
 customer_id text NOT NULL, member_id uuid NOT NULL,
 tier text NOT NULL CHECK(tier IN ('seeker','scholar','philosopher')),
 status text NOT NULL CHECK(status IN ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')),
 paid boolean NOT NULL, valid boolean NOT NULL, period_start timestamptz, period_end timestamptz,
 PRIMARY KEY(scope,id), FOREIGN KEY(scope,customer_id,member_id) REFERENCES public.legacy_billing_customers(scope,customer_id,member_id),
 CHECK((period_start IS NULL AND period_end IS NULL) OR (period_start IS NOT NULL AND period_end IS NOT NULL
  AND isfinite(period_start) AND isfinite(period_end) AND period_end>period_start AND period_end<=period_start+interval '2 years')),
 CHECK(NOT paid OR (status='active' AND period_start IS NOT NULL AND period_end IS NOT NULL))
);
CREATE TABLE public.legacy_billing_lifetimes (
 scope text NOT NULL, id text NOT NULL CHECK(length(id)<=200 AND id ~ '^cs_(test_|live_)[A-Za-z0-9]+$'),
 customer_id text NOT NULL, member_id uuid NOT NULL, tier text NOT NULL CHECK(tier='oracle'),
 status text NOT NULL CHECK(status IN ('open','complete','expired')), paid boolean NOT NULL, valid boolean NOT NULL,
 PRIMARY KEY(scope,id), FOREIGN KEY(scope,customer_id,member_id) REFERENCES public.legacy_billing_customers(scope,customer_id,member_id),
 CHECK((left(scope,5)='test:' AND left(id,8)='cs_test_') OR (left(scope,5)='live:' AND left(id,8)='cs_live_')),
 CHECK(NOT paid OR status='complete')
);
CREATE TABLE public.legacy_billing_invalidations (
 scope text NOT NULL, kind text NOT NULL CHECK(kind IN ('subscription','lifetime')), source_id text NOT NULL,
 member_id uuid NOT NULL REFERENCES public.members(id), created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(scope,kind,source_id)
);
CREATE TABLE public.legacy_billing_receipts (
 scope text NOT NULL, event_id text NOT NULL CHECK(length(event_id)<=200 AND event_id ~ '^evt_[A-Za-z0-9]+$'),
 payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'), member_id uuid NOT NULL,
 customer_id text NOT NULL, revision bigint NOT NULL, tier_written boolean NOT NULL, applied_tier text,
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(), PRIMARY KEY(scope,event_id),
 FOREIGN KEY(scope,customer_id,member_id) REFERENCES public.legacy_billing_customers(scope,customer_id,member_id)
);
ALTER TABLE public.legacy_billing_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_billing_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_billing_lifetimes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_billing_invalidations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_billing_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.legacy_billing_members,public.legacy_billing_customers,public.legacy_billing_subscriptions,
 public.legacy_billing_lifetimes,public.legacy_billing_invalidations,public.legacy_billing_receipts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.legacy_billing_members,public.legacy_billing_customers,
 public.legacy_billing_subscriptions,public.legacy_billing_lifetimes TO service_role;
GRANT SELECT,INSERT ON public.legacy_billing_invalidations,public.legacy_billing_receipts TO service_role;
GRANT SELECT(id,tier,stripe_customer_id),UPDATE(tier) ON public.members TO service_role;

CREATE FUNCTION public._legacy_billing_validate(p_scope text,p_customer text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
 IF p_scope IS NULL OR length(p_scope)>100 OR p_scope !~ '^(test|live):acct_[A-Za-z0-9]+$'
  OR p_customer IS NULL OR length(p_customer)>200 OR p_customer !~ '^cus_[A-Za-z0-9]+$' THEN
  RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid legacy billing request'; END IF;
END $$;
CREATE FUNCTION public._legacy_billing_rank(p_tier text) RETURNS integer
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE p_tier WHEN 'seeker' THEN 1 WHEN 'scholar' THEN 2 WHEN 'philosopher' THEN 3 WHEN 'oracle' THEN 4 ELSE 0 END
$$;
CREATE FUNCTION public._legacy_billing_pointer_owner(p_customer text) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE owners uuid[]; BEGIN
 SELECT array_agg(id ORDER BY id) INTO owners FROM public.members WHERE stripe_customer_id=p_customer;
 IF cardinality(owners)>1 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Ambiguous legacy billing owner'; END IF;
 RETURN owners[1];
END $$;
-- The old pointer is unscoped and never grants authority. This short barrier
-- only prevents its ownership-conflict check from racing an INSERT or pointer
-- UPDATE on a previously nonmatching member row. It runs before row locks, in
-- the same order as reconciliation. Ordinary profile/tier updates do not enter
-- the barrier. New member INSERTs and pointer writes may briefly wait for a
-- billing transaction; no provider/network work occurs inside that transaction.
CREATE FUNCTION public._legacy_billing_pointer_barrier() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('soe-legacy:pointer-owner-barrier',0));
 RETURN NULL;
END $$;
CREATE TRIGGER legacy_billing_pointer_barrier BEFORE INSERT OR UPDATE OF stripe_customer_id ON public.members
 FOR EACH STATEMENT EXECUTE FUNCTION public._legacy_billing_pointer_barrier();
CREATE FUNCTION public._legacy_billing_state(p_member uuid,p_scope text,p_customer text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('memberId',m.id,'revision',coalesce(b.revision,0),'expectedTier',m.tier,
 'baselineTier',CASE WHEN b.member_id IS NULL THEN CASE WHEN left(p_scope,5)='live:' THEN m.tier ELSE NULL END ELSE b.baseline_tier END,
 'externalChange',coalesce(b.external_change,false) OR coalesce(b.mode='live' AND m.tier IS DISTINCT FROM b.last_applied_tier,false),
 'needsReview',coalesce(b.needs_review,false) OR (left(p_scope,5)='live:' AND
   ((b.member_id IS NULL AND coalesce(m.tier,'free') NOT IN ('free','explorer','')) OR coalesce(b.external_change,false)
    OR (b.member_id IS NOT NULL AND m.tier IS DISTINCT FROM b.last_applied_tier)))
   OR (left(p_scope,5)='live:' AND EXISTS(SELECT 1 FROM public.legacy_billing_customers other_customer WHERE other_customer.member_id=m.id
    AND other_customer.mode='live' AND other_customer.scope<>p_scope)),
 'customers',(SELECT coalesce(jsonb_agg(c.customer_id ORDER BY c.customer_id),'[]'::jsonb) FROM
   (SELECT customer_id FROM public.legacy_billing_customers WHERE member_id=m.id AND scope=p_scope UNION SELECT p_customer) c),
 'otherLiveScopes',left(p_scope,5)='live:' AND EXISTS(SELECT 1 FROM public.legacy_billing_customers other_customer
   WHERE other_customer.member_id=m.id AND other_customer.mode='live' AND other_customer.scope<>p_scope))
 FROM public.members m LEFT JOIN public.legacy_billing_members b ON b.member_id=m.id AND b.mode=split_part(p_scope,':',1)
 WHERE m.id=p_member
$$;
CREATE FUNCTION public.soe_legacy_billing_event_state(p_scope text,p_customer_id text,p_verified_member_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_member uuid; v_tier text; v_pointer uuid; BEGIN
 PERFORM public._legacy_billing_validate(p_scope,p_customer_id);
 v_pointer:=public._legacy_billing_pointer_owner(p_customer_id);
 SELECT member_id INTO v_member FROM public.legacy_billing_customers WHERE scope=p_scope AND customer_id=p_customer_id;
 IF v_member IS NOT NULL AND p_verified_member_id IS NOT NULL AND v_member<>p_verified_member_id THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Legacy billing ownership conflict'; END IF;
 IF v_pointer IS NOT NULL AND ((v_member IS NOT NULL AND v_pointer<>v_member)
  OR (p_verified_member_id IS NOT NULL AND v_pointer<>p_verified_member_id)) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Legacy billing ownership conflict'; END IF;
 v_member:=coalesce(v_member,p_verified_member_id);
 SELECT tier INTO v_tier FROM public.members WHERE id=v_member;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Legacy billing owner unavailable'; END IF;
 IF length(v_tier)>128 OR v_tier ~ '[[:cntrl:]]' THEN RAISE EXCEPTION USING ERRCODE='PT503',MESSAGE='Legacy billing state unavailable'; END IF;
 RETURN public._legacy_billing_state(v_member,p_scope,p_customer_id);
END $$;

CREATE FUNCTION public.soe_legacy_billing_apply_event(p_scope text,p_event_id text,p_payload_hash text,p_member_id uuid,
 p_customer_id text,p_expected_revision bigint,p_expected_tier text,p_snapshot jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_mode text; v_tier text; v_next text; v_written boolean:=false; v_freeze boolean; v_other boolean;
 b public.legacy_billing_members; r public.legacy_billing_receipts;
 c jsonb; s jsonb; risk jsonb; v_customer text; v_kind text; v_id text; v_start timestamptz; v_end timestamptz;
 v_customers text[]:=ARRAY[]::text[]; v_sources text[]:=ARRAY[]::text[]; v_risks text[]:=ARRAY[]::text[];
 v_total integer:=0; v_rank integer; v_best integer; v_review boolean; v_owner uuid; v_rows integer;
BEGIN
 PERFORM public._legacy_billing_validate(p_scope,p_customer_id); v_mode:=split_part(p_scope,':',1);
 IF p_member_id IS NULL OR p_event_id IS NULL OR length(p_event_id)>200 OR p_event_id !~ '^evt_[A-Za-z0-9]+$'
  OR p_payload_hash IS NULL OR p_payload_hash !~ '^[a-f0-9]{64}$' OR p_expected_revision IS NULL OR p_expected_revision<0 THEN
  RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid legacy billing event'; END IF;
 -- One LIVE revision covers every LIVE account/customer for this member. TEST
 -- has a different state/lock and cannot seed or freeze the LIVE baseline.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('soe-legacy:pointer-owner-barrier',0));
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('soe-legacy:'||v_mode||':'||p_member_id::text,0));
 SELECT tier INTO v_tier FROM public.members WHERE id=p_member_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Legacy billing owner unavailable'; END IF;
 IF length(v_tier)>128 OR v_tier ~ '[[:cntrl:]]' THEN RAISE EXCEPTION USING ERRCODE='PT503',MESSAGE='Legacy billing state unavailable'; END IF;
 v_owner:=public._legacy_billing_pointer_owner(p_customer_id);
 IF v_owner IS NOT NULL AND v_owner<>p_member_id THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Legacy billing ownership conflict'; END IF;
 SELECT member_id INTO v_owner FROM public.legacy_billing_customers WHERE scope=p_scope AND customer_id=p_customer_id;
 IF v_owner IS NOT NULL AND v_owner<>p_member_id THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Legacy billing ownership conflict'; END IF;
 SELECT * INTO r FROM public.legacy_billing_receipts WHERE scope=p_scope AND event_id=p_event_id;
 IF r.event_id IS NOT NULL THEN
  IF r.payload_hash<>p_payload_hash OR r.member_id<>p_member_id OR r.customer_id<>p_customer_id THEN
   RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Legacy billing event conflict'; END IF;
  RETURN public._legacy_billing_state(p_member_id,p_scope,p_customer_id)||jsonb_build_object('tier',v_tier,'tierWritten',false,'replayed',true,'appliedRevision',r.revision);
 END IF;
 SELECT * INTO b FROM public.legacy_billing_members WHERE member_id=p_member_id AND mode=v_mode FOR UPDATE;
 IF coalesce(b.revision,0)<>p_expected_revision OR v_tier IS DISTINCT FROM p_expected_tier THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Legacy billing state changed'; END IF;
 IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot)<>'object' OR NOT p_snapshot ?& ARRAY['customers','invalidatedSourceIds','needsReview']
  OR (p_snapshot-ARRAY['customers','invalidatedSourceIds','needsReview'])<>'{}'::jsonb
  OR jsonb_typeof(p_snapshot->'customers')<>'array' OR jsonb_array_length(p_snapshot->'customers') NOT BETWEEN 1 AND 25
  OR jsonb_typeof(p_snapshot->'invalidatedSourceIds')<>'array' OR jsonb_array_length(p_snapshot->'invalidatedSourceIds')>100
  OR jsonb_typeof(p_snapshot->'needsReview')<>'boolean' THEN
  RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid legacy billing snapshot'; END IF;
 v_review:=(p_snapshot->>'needsReview')::boolean;
 IF b.member_id IS NULL THEN
  INSERT INTO public.legacy_billing_members(member_id,mode,baseline_tier,last_applied_tier,needs_review)
   VALUES(p_member_id,v_mode,CASE WHEN v_mode='live' THEN v_tier ELSE NULL END,v_tier,
    v_mode='live' AND coalesce(v_tier,'free') NOT IN ('free','explorer','')) RETURNING * INTO b;
 ELSIF v_mode='live' AND v_tier IS DISTINCT FROM b.last_applied_tier THEN
  UPDATE public.legacy_billing_members SET external_change=true,needs_review=true WHERE member_id=p_member_id AND mode=v_mode RETURNING * INTO b;
 END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(p_snapshot->'customers') LOOP
  IF jsonb_typeof(c)<>'object' OR NOT c ?& ARRAY['customerId','sources'] OR (c-ARRAY['customerId','sources'])<>'{}'::jsonb
   OR jsonb_typeof(c->'customerId')<>'string' OR length(c->>'customerId')>200 OR (c->>'customerId') !~ '^cus_[A-Za-z0-9]+$'
   OR jsonb_typeof(c->'sources')<>'array' OR jsonb_array_length(c->'sources')>100 THEN
   RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid legacy billing customer'; END IF;
  v_customer:=c->>'customerId';
  IF v_customer=ANY(v_customers) THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Duplicate legacy billing customer'; END IF;
  v_customers:=array_append(v_customers,v_customer);
  v_owner:=public._legacy_billing_pointer_owner(v_customer);
  IF v_owner IS NOT NULL AND v_owner<>p_member_id THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Legacy billing ownership conflict'; END IF;
  SELECT member_id INTO v_owner FROM public.legacy_billing_customers WHERE scope=p_scope AND customer_id=v_customer;
  IF v_owner IS NOT NULL AND v_owner<>p_member_id THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Legacy billing ownership conflict'; END IF;
  INSERT INTO public.legacy_billing_customers(scope,customer_id,member_id,mode) VALUES(p_scope,v_customer,p_member_id,v_mode) ON CONFLICT DO NOTHING;
  SELECT member_id INTO v_owner FROM public.legacy_billing_customers WHERE scope=p_scope AND customer_id=v_customer;
  IF v_owner<>p_member_id THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Legacy billing ownership conflict'; END IF;
  FOR s IN SELECT value FROM jsonb_array_elements(c->'sources') LOOP
   v_total:=v_total+1;
   IF v_total>500 OR jsonb_typeof(s)<>'object' OR NOT s ?& ARRAY['id','kind','tier','status','paid','valid','periodStart','periodEnd']
    OR (s-ARRAY['id','kind','tier','status','paid','valid','periodStart','periodEnd'])<>'{}'::jsonb
    OR jsonb_typeof(s->'id')<>'string' OR length(s->>'id')>200 OR jsonb_typeof(s->'kind')<>'string'
    OR jsonb_typeof(s->'tier')<>'string' OR jsonb_typeof(s->'status')<>'string' OR jsonb_typeof(s->'paid')<>'boolean'
    OR jsonb_typeof(s->'valid')<>'boolean' OR (s->>'kind') NOT IN ('subscription','lifetime') THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid legacy billing source'; END IF;
   v_kind:=s->>'kind';v_id:=s->>'id';
   IF v_kind||':'||v_id=ANY(v_sources) THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Duplicate legacy billing source'; END IF;
   v_sources:=array_append(v_sources,v_kind||':'||v_id);
   IF NOT (s->>'valid')::boolean AND NOT v_review THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Uncertain legacy billing source'; END IF;
   IF v_kind='subscription' THEN
    IF v_id !~ '^sub_[A-Za-z0-9]+$' OR (s->>'tier') NOT IN ('seeker','scholar','philosopher')
     OR (s->>'status') NOT IN ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')
     OR jsonb_typeof(s->'periodStart') NOT IN ('string','null') OR jsonb_typeof(s->'periodEnd') NOT IN ('string','null') THEN
     RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid legacy billing subscription'; END IF;
    BEGIN v_start:=(s->>'periodStart')::timestamptz;v_end:=(s->>'periodEnd')::timestamptz;
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid legacy billing period'; END;
    IF (v_start IS NULL)<>(v_end IS NULL) OR (v_start IS NOT NULL AND (NOT isfinite(v_start) OR NOT isfinite(v_end)
      OR v_end<=v_start OR v_end>v_start+interval '2 years')) OR ((s->>'paid')::boolean AND ((s->>'status')<>'active' OR v_start IS NULL)) THEN
     RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid legacy billing period'; END IF;
    IF EXISTS(SELECT 1 FROM public.legacy_billing_subscriptions old_source WHERE old_source.scope=p_scope AND old_source.id=v_id
     AND (old_source.member_id<>p_member_id OR old_source.customer_id<>v_customer)) THEN
     RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Legacy billing source ownership conflict'; END IF;
    INSERT INTO public.legacy_billing_subscriptions(scope,id,customer_id,member_id,tier,status,paid,valid,period_start,period_end)
     VALUES(p_scope,v_id,v_customer,p_member_id,s->>'tier',s->>'status',(s->>'paid')::boolean,(s->>'valid')::boolean,v_start,v_end)
     ON CONFLICT(scope,id) DO UPDATE SET tier=EXCLUDED.tier,status=EXCLUDED.status,paid=EXCLUDED.paid,valid=EXCLUDED.valid,
      period_start=EXCLUDED.period_start,period_end=EXCLUDED.period_end
      WHERE public.legacy_billing_subscriptions.member_id=EXCLUDED.member_id AND public.legacy_billing_subscriptions.customer_id=EXCLUDED.customer_id;
    GET DIAGNOSTICS v_rows=ROW_COUNT;
    IF v_rows<>1 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Legacy billing source ownership conflict'; END IF;
   ELSE
    IF v_id !~ '^cs_(test_|live_)[A-Za-z0-9]+$' OR left(v_id,8)<>(CASE WHEN v_mode='live' THEN 'cs_live_' ELSE 'cs_test_' END)
     OR s->>'tier'<>'oracle' OR (s->>'status') NOT IN ('open','complete','expired') OR s->'periodStart'<>'null'::jsonb
     OR s->'periodEnd'<>'null'::jsonb OR ((s->>'paid')::boolean AND s->>'status'<>'complete') THEN
     RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid legacy lifetime source'; END IF;
    IF EXISTS(SELECT 1 FROM public.legacy_billing_lifetimes old_source WHERE old_source.scope=p_scope AND old_source.id=v_id
     AND (old_source.member_id<>p_member_id OR old_source.customer_id<>v_customer)) THEN
     RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Legacy billing source ownership conflict'; END IF;
    INSERT INTO public.legacy_billing_lifetimes(scope,id,customer_id,member_id,tier,status,paid,valid)
     VALUES(p_scope,v_id,v_customer,p_member_id,'oracle',s->>'status',(s->>'paid')::boolean,(s->>'valid')::boolean)
     ON CONFLICT(scope,id) DO UPDATE SET status=EXCLUDED.status,paid=EXCLUDED.paid,valid=EXCLUDED.valid
      WHERE public.legacy_billing_lifetimes.member_id=EXCLUDED.member_id AND public.legacy_billing_lifetimes.customer_id=EXCLUDED.customer_id;
    GET DIAGNOSTICS v_rows=ROW_COUNT;
    IF v_rows<>1 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Legacy billing source ownership conflict'; END IF;
   END IF;
  END LOOP;
 END LOOP;
 -- Complete inventories retain known terminal sources; an omitted row is never
 -- evidence that an old subscription or lifetime purchase ceased to exist.
 IF NOT p_customer_id=ANY(v_customers) OR EXISTS(SELECT 1 FROM public.legacy_billing_customers known_customer
  WHERE known_customer.member_id=p_member_id AND known_customer.scope=p_scope AND NOT known_customer.customer_id=ANY(v_customers))
  OR EXISTS(SELECT 1 FROM public.legacy_billing_subscriptions known_source WHERE known_source.member_id=p_member_id
   AND known_source.scope=p_scope AND NOT ('subscription:'||known_source.id)=ANY(v_sources))
  OR EXISTS(SELECT 1 FROM public.legacy_billing_lifetimes known_source WHERE known_source.member_id=p_member_id
   AND known_source.scope=p_scope AND NOT ('lifetime:'||known_source.id)=ANY(v_sources)) THEN
  RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Incomplete legacy billing inventory'; END IF;
 FOR risk IN SELECT value FROM jsonb_array_elements(p_snapshot->'invalidatedSourceIds') LOOP
  IF jsonb_typeof(risk)<>'object' OR NOT risk ?& ARRAY['kind','id'] OR (risk-ARRAY['kind','id'])<>'{}'::jsonb
   OR jsonb_typeof(risk->'kind')<>'string' OR jsonb_typeof(risk->'id')<>'string' OR (risk->>'kind') NOT IN ('subscription','lifetime') THEN
   RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid legacy billing risk'; END IF;
  v_kind:=risk->>'kind';v_id:=risk->>'id';
  IF NOT (v_kind||':'||v_id)=ANY(v_sources) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Legacy billing risk owner unavailable'; END IF;
  IF (v_kind||':'||v_id)=ANY(v_risks) THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Duplicate legacy billing risk'; END IF;
  v_risks:=array_append(v_risks,v_kind||':'||v_id);
  INSERT INTO public.legacy_billing_invalidations(scope,kind,source_id,member_id) VALUES(p_scope,v_kind,v_id,p_member_id) ON CONFLICT DO NOTHING;
 END LOOP;
 v_other:=v_mode='live' AND EXISTS(SELECT 1 FROM public.legacy_billing_customers other_customer WHERE other_customer.member_id=p_member_id
  AND other_customer.mode='live' AND other_customer.scope<>p_scope);
 v_freeze:=b.external_change OR v_review OR (b.baseline_tier IS NOT NULL AND b.baseline_tier NOT IN ('free','explorer','','seeker','scholar','philosopher','oracle'));
 v_next:=b.baseline_tier;v_best:=public._legacy_billing_rank(v_next);
 -- Only this scope was freshly enumerated. Rows from another provider account
 -- cannot create or increase an entitlement; they only cause the conservative
 -- current-tier preservation/review rule below when a downgrade is proposed.
 SELECT coalesce(max(eligible.rank),0) INTO v_rank FROM (
  SELECT public._legacy_billing_rank(q.tier) AS rank FROM public.legacy_billing_subscriptions q
   WHERE q.member_id=p_member_id AND q.scope=p_scope AND q.status='active' AND q.paid AND q.valid
    AND q.period_start<=transaction_timestamp() AND q.period_end>transaction_timestamp()
    AND NOT EXISTS(SELECT 1 FROM public.legacy_billing_invalidations i WHERE i.scope=q.scope AND i.kind='subscription' AND i.source_id=q.id)
  UNION ALL SELECT 4 FROM public.legacy_billing_lifetimes q WHERE q.member_id=p_member_id AND q.scope=p_scope
   AND q.status='complete' AND q.paid AND q.valid AND NOT EXISTS(SELECT 1 FROM public.legacy_billing_invalidations i
    WHERE i.scope=q.scope AND i.kind='lifetime' AND i.source_id=q.id)) eligible;
 IF v_rank>v_best THEN v_next:=CASE v_rank WHEN 1 THEN 'seeker' WHEN 2 THEN 'scholar' WHEN 3 THEN 'philosopher' WHEN 4 THEN 'oracle' END; END IF;
 IF v_other AND public._legacy_billing_rank(v_next)<public._legacy_billing_rank(v_tier) THEN v_freeze:=true; END IF;
 IF v_mode='live' AND NOT v_freeze AND v_tier IS DISTINCT FROM v_next THEN
  UPDATE public.members SET tier=v_next WHERE id=p_member_id;v_tier:=v_next;v_written:=true;
  UPDATE public.legacy_billing_members SET last_applied_tier=v_next WHERE member_id=p_member_id AND mode=v_mode;
 END IF;
 UPDATE public.legacy_billing_members SET revision=revision+1,
  needs_review=needs_review OR v_review OR v_other OR cardinality(v_risks)>0 OR v_freeze
  WHERE member_id=p_member_id AND mode=v_mode RETURNING * INTO b;
 INSERT INTO public.legacy_billing_receipts(scope,event_id,payload_hash,member_id,customer_id,revision,tier_written,applied_tier)
  VALUES(p_scope,p_event_id,p_payload_hash,p_member_id,p_customer_id,b.revision,v_written,v_tier);
 RETURN public._legacy_billing_state(p_member_id,p_scope,p_customer_id)||jsonb_build_object('tier',v_tier,'tierWritten',v_written,'replayed',false,'appliedRevision',b.revision);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Legacy billing ownership or event conflict';
END $$;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname ~ '^(_legacy_billing_|soe_legacy_billing_)' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
COMMIT;
