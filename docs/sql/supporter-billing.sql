-- UNAPPLIED supporter billing draft. Apply only after a reviewed deployment plan.
-- This optional offer never writes members.tier or grants community entitlements.
-- Provider ownership/product checks remain mandatory in the trusted HTTP service.
BEGIN;

CREATE TABLE public.supporter_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id),
  scope text NOT NULL CHECK (length(scope) <= 100 AND scope ~ '^(test|live):acct_[A-Za-z0-9]+$'),
  customer_id text CHECK (customer_id ~ '^cus_[A-Za-z0-9]+$' AND length(customer_id) <= 200),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740990),
  risk_review boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE(member_id, scope), UNIQUE(scope, customer_id), UNIQUE(id, scope)
);

CREATE TABLE public.supporter_checkout_attempts (
  account_id uuid NOT NULL REFERENCES public.supporter_accounts(id),
  scope text NOT NULL,
  ordinal bigint GENERATED ALWAYS AS IDENTITY,
  request_id uuid NOT NULL,
  offer_id text NOT NULL CHECK (offer_id = 'soe-supporter-monthly-v1'),
  terms_version text NOT NULL CHECK (terms_version = 'supporter-2026-11-03-v1'),
  config_hash text NOT NULL CHECK (config_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','unknown','completed','expired','rejected')),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  retry_until timestamptz NOT NULL,
  customer_id text CHECK (customer_id ~ '^cus_[A-Za-z0-9]+$' AND length(customer_id) <= 200),
  session_id text CHECK (session_id ~ '^cs_(test_|live_)?[A-Za-z0-9]+$' AND length(session_id) <= 200),
  session_url text CHECK (length(session_url) <= 2048 AND session_url ~ '^https://checkout[.]stripe[.]com/[^[:space:][:cntrl:]]+$'),
  session_expires_at timestamptz,
  subscription_id text CHECK (subscription_id ~ '^sub_[A-Za-z0-9]+$' AND length(subscription_id) <= 200),
  resolved_at timestamptz,
  terminal_verified_at timestamptz,
  PRIMARY KEY(account_id, request_id),
  FOREIGN KEY(account_id,scope) REFERENCES public.supporter_accounts(id,scope),
  CHECK (session_id IS NULL OR (left(scope,5)='test:' AND left(session_id,8)='cs_test_')
    OR (left(scope,5)='live:' AND left(session_id,8)='cs_live_')),
  CHECK (expires_at = created_at + interval '1 hour' AND retry_until = created_at + interval '22 hours'),
  CHECK ((session_id IS NULL AND session_url IS NULL AND session_expires_at IS NULL)
      OR (session_id IS NOT NULL AND session_expires_at IS NOT NULL AND session_expires_at = expires_at AND customer_id IS NOT NULL
        AND (session_url IS NOT NULL OR status IN ('completed','expired')))),
  CHECK (status NOT IN ('ready','completed','expired') OR session_id IS NOT NULL),
  CHECK ((status='completed') = (subscription_id IS NOT NULL)),
  CHECK ((status IN ('completed','expired','rejected')) = (resolved_at IS NOT NULL)),
  CHECK (terminal_verified_at IS NULL OR (status='completed' AND terminal_verified_at>=resolved_at))
);
CREATE UNIQUE INDEX supporter_checkout_session_unique ON public.supporter_checkout_attempts(scope,session_id) WHERE session_id IS NOT NULL;
CREATE UNIQUE INDEX supporter_checkout_pending_unique ON public.supporter_checkout_attempts(account_id) WHERE status IN ('pending','ready','unknown');

CREATE TABLE public.supporter_portal_attempts (
  account_id uuid NOT NULL REFERENCES public.supporter_accounts(id),
  scope text NOT NULL,
  ordinal bigint GENERATED ALWAYS AS IDENTITY,
  request_id uuid NOT NULL,
  config_hash text NOT NULL CHECK (config_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','unknown')),
  created_at timestamptz NOT NULL,
  retry_until timestamptz NOT NULL,
  session_id text CHECK (session_id ~ '^bps_[A-Za-z0-9]+$' AND length(session_id) <= 200),
  session_url text CHECK (length(session_url) <= 2048 AND session_url ~ '^https://billing[.]stripe[.]com/[^[:space:][:cntrl:]]+$'),
  PRIMARY KEY(account_id, request_id),
  FOREIGN KEY(account_id,scope) REFERENCES public.supporter_accounts(id,scope),
  CHECK (retry_until = created_at + interval '22 hours'),
  CHECK ((session_id IS NULL AND session_url IS NULL) OR (session_id IS NOT NULL AND session_url IS NOT NULL)),
  CHECK (status <> 'ready' OR session_id IS NOT NULL)
);
CREATE UNIQUE INDEX supporter_portal_session_unique ON public.supporter_portal_attempts(scope,session_id) WHERE session_id IS NOT NULL;

CREATE TABLE public.supporter_subscriptions (
  account_id uuid PRIMARY KEY,
  scope text NOT NULL,
  subscription_id text NOT NULL CHECK (subscription_id ~ '^sub_[A-Za-z0-9]+$' AND length(subscription_id) <= 200),
  status text NOT NULL CHECK (status IN ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')),
  cancel_at_period_end boolean NOT NULL,
  current_period_start timestamptz,
  current_period_end timestamptz,
  paid boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  FOREIGN KEY(account_id,scope) REFERENCES public.supporter_accounts(id,scope),
  UNIQUE(scope,subscription_id),
  CHECK ((current_period_start IS NULL AND current_period_end IS NULL) OR
    (current_period_start IS NOT NULL AND current_period_end IS NOT NULL AND isfinite(current_period_start) AND isfinite(current_period_end)
      AND current_period_end > current_period_start
      AND current_period_end <= current_period_start + interval '2 years')),
  CHECK (NOT paid OR status IN ('active','past_due','canceled','unpaid','paused'))
);

CREATE TABLE public.supporter_webhook_receipts (
  scope text NOT NULL,
  event_id text NOT NULL CHECK (event_id ~ '^evt_[A-Za-z0-9]+$' AND length(event_id) <= 200),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  account_id uuid NOT NULL,
  customer_id text NOT NULL,
  event_kind text NOT NULL CHECK (event_kind IN ('checkout','subscription','invoice','risk')),
  applied_revision bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY(scope,event_id),
  FOREIGN KEY(account_id,scope) REFERENCES public.supporter_accounts(id,scope)
);

ALTER TABLE public.supporter_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supporter_checkout_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supporter_portal_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supporter_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supporter_webhook_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supporter_accounts,public.supporter_checkout_attempts,public.supporter_portal_attempts,
  public.supporter_subscriptions,public.supporter_webhook_receipts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.supporter_accounts,public.supporter_checkout_attempts,
  public.supporter_portal_attempts,public.supporter_subscriptions TO service_role;
GRANT SELECT,INSERT ON public.supporter_webhook_receipts TO service_role;
REVOKE ALL ON SEQUENCE public.supporter_checkout_attempts_ordinal_seq,public.supporter_portal_attempts_ordinal_seq FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SEQUENCE public.supporter_checkout_attempts_ordinal_seq,public.supporter_portal_attempts_ordinal_seq TO service_role;

CREATE FUNCTION public._supporter_validate_actor(p_actor uuid,p_scope text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF p_actor IS NULL OR p_scope IS NULL OR length(p_scope)>100 OR p_scope !~ '^(test|live):acct_[A-Za-z0-9]+$' THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid supporter request';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.members WHERE id=p_actor) THEN
    RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Supporter access unavailable';
  END IF;
END $$;

CREATE FUNCTION public._supporter_other_scope_blocked(p_actor uuid,p_scope text) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT EXISTS(SELECT 1 FROM public.supporter_accounts other_account WHERE other_account.member_id=p_actor
    AND other_account.scope<>p_scope AND split_part(other_account.scope,':',1)=split_part(p_scope,':',1)
    AND (other_account.risk_review
      OR EXISTS(SELECT 1 FROM public.supporter_checkout_attempts unfinished WHERE unfinished.account_id=other_account.id
        AND unfinished.status IN ('pending','ready','unknown'))
      OR EXISTS(SELECT 1 FROM public.supporter_subscriptions active_sub WHERE active_sub.account_id=other_account.id
        AND active_sub.status NOT IN ('canceled','incomplete_expired'))
      OR EXISTS(SELECT 1 FROM public.supporter_checkout_attempts completed_attempt WHERE completed_attempt.account_id=other_account.id
        AND completed_attempt.status='completed' AND completed_attempt.terminal_verified_at IS NULL)))
$$;

CREATE FUNCTION public._supporter_state(p_account uuid,p_request uuid DEFAULT NULL,p_portal_request uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT jsonb_build_object('accountId',a.id,'revision',a.revision,'customerId',a.customer_id,'riskReview',a.risk_review,
  'otherScopeBlocked',public._supporter_other_scope_blocked(a.member_id,a.scope),
  'attempt',(SELECT jsonb_build_object('requestId',t.request_id,'status',t.status,'createdAt',t.created_at,'expiresAt',t.expires_at,
    'retryUntil',t.retry_until,'offerId',t.offer_id,'termsVersion',t.terms_version,'configHash',t.config_hash,
    'customerId',t.customer_id,'sessionId',t.session_id,'sessionUrl',t.session_url,'sessionExpiresAt',t.session_expires_at,
    'subscriptionId',t.subscription_id,'resolvedAt',t.resolved_at)
    FROM public.supporter_checkout_attempts t WHERE t.account_id=a.id AND (p_request IS NULL OR t.request_id=p_request)
    ORDER BY t.ordinal DESC LIMIT 1),
  'portalAttempt',(SELECT jsonb_build_object('requestId',t.request_id,'status',t.status,'createdAt',t.created_at,
    'retryUntil',t.retry_until,'configHash',t.config_hash,'sessionId',t.session_id,'sessionUrl',t.session_url)
    FROM public.supporter_portal_attempts t WHERE t.account_id=a.id AND (p_portal_request IS NULL OR t.request_id=p_portal_request)
    ORDER BY t.ordinal DESC LIMIT 1),
  'subscription',(SELECT jsonb_build_object('id',s.subscription_id,'status',s.status,'cancelAtPeriodEnd',s.cancel_at_period_end,
    'currentPeriodStart',s.current_period_start,'currentPeriodEnd',s.current_period_end,'paid',s.paid)
    FROM public.supporter_subscriptions s WHERE s.account_id=a.id))
 FROM public.supporter_accounts a WHERE a.id=p_account
$$;

CREATE FUNCTION public.soe_supporter_read(p_actor uuid,p_scope text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_account uuid;
BEGIN
  PERFORM public._supporter_validate_actor(p_actor,p_scope);
  SELECT id INTO v_account FROM public.supporter_accounts WHERE member_id=p_actor AND scope=p_scope;
  IF v_account IS NULL THEN RETURN jsonb_build_object('accountId',NULL,'revision',0,'customerId',NULL,'riskReview',false,
    'otherScopeBlocked',public._supporter_other_scope_blocked(p_actor,p_scope),'attempt',NULL,'portalAttempt',NULL,'subscription',NULL); END IF;
  RETURN public._supporter_state(v_account);
END $$;

CREATE FUNCTION public.soe_supporter_return_read(p_actor uuid,p_scope text,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_account uuid;
BEGIN
  PERFORM public._supporter_validate_actor(p_actor,p_scope);
  SELECT a.id INTO v_account FROM public.supporter_accounts a JOIN public.supporter_checkout_attempts t ON t.account_id=a.id
    WHERE a.member_id=p_actor AND a.scope=p_scope AND t.request_id=p_request_id;
  IF v_account IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Supporter request unavailable'; END IF;
  RETURN public._supporter_state(v_account,p_request_id);
END $$;

CREATE FUNCTION public.soe_supporter_event_state(p_scope text,p_account_id uuid,p_customer_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_account uuid;
BEGIN
  SELECT id INTO v_account FROM public.supporter_accounts WHERE id=p_account_id AND scope=p_scope AND customer_id=p_customer_id;
  IF v_account IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Supporter account unavailable'; END IF;
  RETURN public._supporter_state(v_account);
END $$;

CREATE FUNCTION public.soe_supporter_checkout_begin(p_actor uuid,p_scope text,p_request_id uuid,p_expected_revision bigint,
 p_offer_id text,p_terms_version text,p_config_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE a public.supporter_accounts; t public.supporter_checkout_attempts; v_now timestamptz:=date_trunc('second',transaction_timestamp());
BEGIN
  PERFORM public._supporter_validate_actor(p_actor,p_scope);
  IF p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_offer_id IS DISTINCT FROM 'soe-supporter-monthly-v1'
   OR p_terms_version IS DISTINCT FROM 'supporter-2026-11-03-v1' OR p_config_hash IS NULL OR p_config_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid supporter request'; END IF;
  -- A configured provider account swap must not bypass the same person's
  -- unresolved charge in another account. All checkout begins share this lock;
  -- state blocking is limited to the same test/live mode below.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('soe-supporter:'||p_actor::text,0));
  SELECT * INTO a FROM public.supporter_accounts WHERE member_id=p_actor AND scope=p_scope FOR UPDATE;
  IF a.id IS NOT NULL THEN
    SELECT * INTO t FROM public.supporter_checkout_attempts WHERE account_id=a.id AND request_id=p_request_id;
    IF t.request_id IS NOT NULL THEN
      IF t.offer_id<>p_offer_id OR t.terms_version<>p_terms_version OR t.config_hash<>p_config_hash THEN
        RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Supporter request conflict'; END IF;
      RETURN public._supporter_state(a.id,p_request_id)||jsonb_build_object('replayed',true);
    END IF;
  END IF;
  IF coalesce(a.revision,0)<>p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Supporter state changed'; END IF;
  IF public._supporter_other_scope_blocked(p_actor,p_scope) THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Existing supporter activity requires review'; END IF;
  IF a.id IS NULL THEN
    INSERT INTO public.supporter_accounts(member_id,scope) VALUES(p_actor,p_scope) RETURNING * INTO a;
  END IF;
  IF a.risk_review OR EXISTS(SELECT 1 FROM public.supporter_checkout_attempts WHERE account_id=a.id AND status IN ('pending','ready','unknown'))
    OR EXISTS(SELECT 1 FROM public.supporter_subscriptions WHERE account_id=a.id AND status NOT IN ('canceled','incomplete_expired'))
    OR EXISTS(SELECT 1 FROM public.supporter_checkout_attempts completed_attempt WHERE completed_attempt.account_id=a.id
      AND completed_attempt.status='completed' AND completed_attempt.terminal_verified_at IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Existing supporter activity requires review'; END IF;
  IF (SELECT count(*) FROM public.supporter_checkout_attempts WHERE account_id=a.id AND created_at>v_now-interval '24 hours')>=3 THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Supporter request limit reached'; END IF;
  INSERT INTO public.supporter_checkout_attempts(account_id,scope,request_id,offer_id,terms_version,config_hash,created_at,expires_at,retry_until,customer_id)
    VALUES(a.id,p_scope,p_request_id,p_offer_id,p_terms_version,p_config_hash,v_now,v_now+interval '1 hour',v_now+interval '22 hours',a.customer_id);
  UPDATE public.supporter_accounts SET revision=revision+1 WHERE id=a.id;
  RETURN public._supporter_state(a.id,p_request_id)||jsonb_build_object('replayed',false);
END $$;

CREATE FUNCTION public.soe_supporter_checkout_customer(p_actor uuid,p_scope text,p_request_id uuid,p_customer_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE a public.supporter_accounts; t public.supporter_checkout_attempts;
BEGIN
  PERFORM public._supporter_validate_actor(p_actor,p_scope);
  IF p_customer_id IS NULL OR length(p_customer_id)>200 OR p_customer_id !~ '^cus_[A-Za-z0-9]+$' THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid supporter request'; END IF;
  SELECT * INTO a FROM public.supporter_accounts WHERE member_id=p_actor AND scope=p_scope FOR UPDATE;
  SELECT * INTO t FROM public.supporter_checkout_attempts WHERE account_id=a.id AND request_id=p_request_id;
  IF t.request_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Supporter request unavailable'; END IF;
  IF (a.customer_id IS NOT NULL AND a.customer_id<>p_customer_id) OR (t.customer_id IS NOT NULL AND t.customer_id<>p_customer_id) THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Supporter ownership conflict'; END IF;
  IF EXISTS(SELECT 1 FROM public.supporter_accounts WHERE scope=p_scope AND customer_id=p_customer_id AND id<>a.id) THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Supporter ownership conflict'; END IF;
  IF a.customer_id=p_customer_id AND t.customer_id=p_customer_id THEN
    RETURN public._supporter_state(a.id,p_request_id)||jsonb_build_object('replayed',true); END IF;
  IF t.status NOT IN ('pending','unknown') THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Supporter request conflict'; END IF;
  UPDATE public.supporter_accounts SET customer_id=p_customer_id,revision=revision+1 WHERE id=a.id;
  UPDATE public.supporter_checkout_attempts SET customer_id=p_customer_id WHERE account_id=a.id AND request_id=p_request_id;
  RETURN public._supporter_state(a.id,p_request_id)||jsonb_build_object('replayed',false);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Supporter ownership conflict';
END $$;

CREATE FUNCTION public.soe_supporter_checkout_complete(p_actor uuid,p_scope text,p_request_id uuid,p_customer_id text,
 p_session_id text,p_session_url text,p_session_expires_at timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE a public.supporter_accounts; t public.supporter_checkout_attempts;
BEGIN
  PERFORM public._supporter_validate_actor(p_actor,p_scope);
  IF p_session_id IS NULL OR length(p_session_id)>200 OR p_session_id !~ '^cs_(test_|live_)?[A-Za-z0-9]+$'
    OR p_session_url IS NULL OR length(p_session_url)>2048 OR p_session_url !~ '^https://checkout[.]stripe[.]com/[^[:space:][:cntrl:]]+$'
    OR p_session_expires_at IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid supporter request'; END IF;
  SELECT * INTO a FROM public.supporter_accounts WHERE member_id=p_actor AND scope=p_scope FOR UPDATE;
  SELECT * INTO t FROM public.supporter_checkout_attempts WHERE account_id=a.id AND request_id=p_request_id;
  IF t.request_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Supporter request unavailable'; END IF;
  IF a.customer_id IS NULL OR a.customer_id IS DISTINCT FROM p_customer_id OR t.customer_id IS DISTINCT FROM p_customer_id
    OR p_session_expires_at<>t.expires_at THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Supporter ownership conflict'; END IF;
  IF t.session_id IS NOT NULL THEN
    IF t.session_id<>p_session_id OR t.session_url<>p_session_url OR t.session_expires_at<>p_session_expires_at THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Supporter request conflict'; END IF;
    RETURN public._supporter_state(a.id,p_request_id)||jsonb_build_object('replayed',true);
  END IF;
  IF t.status NOT IN ('pending','unknown') THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Supporter request conflict'; END IF;
  UPDATE public.supporter_checkout_attempts SET session_id=p_session_id,session_url=p_session_url,session_expires_at=p_session_expires_at,status='ready'
    WHERE account_id=a.id AND request_id=p_request_id;
  UPDATE public.supporter_accounts SET revision=revision+1 WHERE id=a.id;
  RETURN public._supporter_state(a.id,p_request_id)||jsonb_build_object('replayed',false);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Supporter ownership conflict';
END $$;

CREATE FUNCTION public.soe_supporter_checkout_unknown(p_actor uuid,p_scope text,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE a public.supporter_accounts; t public.supporter_checkout_attempts;
BEGIN
  PERFORM public._supporter_validate_actor(p_actor,p_scope);
  SELECT * INTO a FROM public.supporter_accounts WHERE member_id=p_actor AND scope=p_scope FOR UPDATE;
  SELECT * INTO t FROM public.supporter_checkout_attempts WHERE account_id=a.id AND request_id=p_request_id;
  IF t.request_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Supporter request unavailable'; END IF;
  IF t.status='pending' THEN
    UPDATE public.supporter_checkout_attempts SET status='unknown' WHERE account_id=a.id AND request_id=p_request_id;
    UPDATE public.supporter_accounts SET revision=revision+1 WHERE id=a.id;
  END IF;
  RETURN public._supporter_state(a.id,p_request_id);
END $$;

CREATE FUNCTION public.soe_supporter_checkout_resolve(p_actor uuid,p_scope text,p_request_id uuid,p_expected_revision bigint,
 p_status text,p_session_id text DEFAULT NULL,p_session_url text DEFAULT NULL,p_session_expires_at timestamptz DEFAULT NULL,
 p_subscription_id text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE a public.supporter_accounts; t public.supporter_checkout_attempts;
BEGIN
  PERFORM public._supporter_validate_actor(p_actor,p_scope);
  IF p_status IS NULL OR p_status NOT IN ('completed','expired','rejected') OR p_expected_revision IS NULL OR p_expected_revision<0 THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid supporter request'; END IF;
  IF (p_status='completed' AND (p_subscription_id IS NULL OR length(p_subscription_id)>200 OR p_subscription_id !~ '^sub_[A-Za-z0-9]+$'))
    OR (p_status<>'completed' AND p_subscription_id IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid supporter request'; END IF;
  SELECT * INTO a FROM public.supporter_accounts WHERE member_id=p_actor AND scope=p_scope FOR UPDATE;
  SELECT * INTO t FROM public.supporter_checkout_attempts WHERE account_id=a.id AND request_id=p_request_id;
  IF t.request_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Supporter request unavailable'; END IF;
  IF t.status='completed' AND t.subscription_id IS DISTINCT FROM p_subscription_id THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Supporter request conflict'; END IF;
  IF p_status='rejected' THEN
    IF t.session_id IS NOT NULL OR p_session_id IS NOT NULL OR p_session_url IS NOT NULL OR p_session_expires_at IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Supporter request conflict'; END IF;
  ELSIF t.session_id IS NULL THEN
    IF t.customer_id IS NULL OR a.customer_id IS DISTINCT FROM t.customer_id OR p_session_id IS NULL OR length(p_session_id)>200
      OR p_session_id !~ '^cs_(test_|live_)?[A-Za-z0-9]+$' OR p_session_expires_at IS DISTINCT FROM t.expires_at
      OR (p_session_url IS NOT NULL AND (length(p_session_url)>2048 OR p_session_url !~ '^https://checkout[.]stripe[.]com/[^[:space:][:cntrl:]]+$')) THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Supporter request conflict'; END IF;
  ELSIF p_session_id IS DISTINCT FROM t.session_id OR (p_session_expires_at IS NOT NULL AND p_session_expires_at<>t.expires_at)
    OR (p_session_url IS NOT NULL AND t.session_url IS DISTINCT FROM p_session_url) THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Supporter request conflict';
  END IF;
  IF t.status=p_status THEN RETURN public._supporter_state(a.id,p_request_id)||jsonb_build_object('replayed',true); END IF;
  IF a.revision<>p_expected_revision OR t.status NOT IN ('pending','ready','unknown') THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Supporter state changed'; END IF;
  UPDATE public.supporter_checkout_attempts SET status=p_status,session_id=coalesce(session_id,p_session_id),
    session_url=coalesce(session_url,p_session_url),session_expires_at=coalesce(session_expires_at,p_session_expires_at),
    subscription_id=p_subscription_id,resolved_at=coalesce(resolved_at,transaction_timestamp())
    WHERE account_id=a.id AND request_id=p_request_id;
  UPDATE public.supporter_accounts SET revision=revision+1 WHERE id=a.id;
  RETURN public._supporter_state(a.id,p_request_id)||jsonb_build_object('replayed',false);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Supporter ownership conflict';
END $$;

CREATE FUNCTION public.soe_supporter_portal_begin(p_actor uuid,p_scope text,p_request_id uuid,p_expected_revision bigint,p_config_hash text,
 p_legacy_customer_id text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE a public.supporter_accounts; t public.supporter_portal_attempts; v_now timestamptz:=date_trunc('second',transaction_timestamp());
BEGIN
  PERFORM public._supporter_validate_actor(p_actor,p_scope);
  IF p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_config_hash IS NULL OR p_config_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid supporter request'; END IF;
  IF p_legacy_customer_id IS NOT NULL AND (length(p_legacy_customer_id)>200 OR p_legacy_customer_id !~ '^cus_[A-Za-z0-9]+$') THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid supporter request'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor::text||':'||p_scope,0));
  SELECT * INTO a FROM public.supporter_accounts WHERE member_id=p_actor AND scope=p_scope FOR UPDATE;
  IF a.id IS NULL THEN
    IF p_legacy_customer_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Supporter account unavailable'; END IF;
    IF p_expected_revision<>0 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Supporter state changed'; END IF;
    INSERT INTO public.supporter_accounts(member_id,scope,customer_id) VALUES(p_actor,p_scope,p_legacy_customer_id) RETURNING * INTO a;
  END IF;
  IF p_legacy_customer_id IS NOT NULL AND a.customer_id IS DISTINCT FROM p_legacy_customer_id THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Supporter ownership conflict'; END IF;
  IF a.customer_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Supporter account unavailable'; END IF;
  SELECT * INTO t FROM public.supporter_portal_attempts WHERE account_id=a.id AND request_id=p_request_id;
  IF t.request_id IS NOT NULL THEN
    IF t.config_hash<>p_config_hash THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Supporter request conflict'; END IF;
    RETURN public._supporter_state(a.id,NULL,p_request_id)||jsonb_build_object('replayed',true); END IF;
  IF a.revision<>p_expected_revision OR EXISTS(SELECT 1 FROM public.supporter_portal_attempts WHERE account_id=a.id
    AND status IN ('pending','unknown') AND created_at>v_now-interval '15 minutes') THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Supporter state changed'; END IF;
  IF (SELECT count(*) FROM public.supporter_portal_attempts WHERE account_id=a.id AND created_at>v_now-interval '1 hour')>=5 THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Supporter request limit reached'; END IF;
  INSERT INTO public.supporter_portal_attempts(account_id,scope,request_id,config_hash,created_at,retry_until)
    VALUES(a.id,p_scope,p_request_id,p_config_hash,v_now,v_now+interval '22 hours');
  UPDATE public.supporter_accounts SET revision=revision+1 WHERE id=a.id;
  RETURN public._supporter_state(a.id,NULL,p_request_id)||jsonb_build_object('replayed',false);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Supporter ownership conflict';
END $$;

CREATE FUNCTION public.soe_supporter_portal_complete(p_actor uuid,p_scope text,p_request_id uuid,p_session_id text,p_session_url text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE a public.supporter_accounts; t public.supporter_portal_attempts;
BEGIN
  PERFORM public._supporter_validate_actor(p_actor,p_scope);
  IF p_session_id IS NULL OR length(p_session_id)>200 OR p_session_id !~ '^bps_[A-Za-z0-9]+$' OR p_session_url IS NULL
    OR length(p_session_url)>2048 OR p_session_url !~ '^https://billing[.]stripe[.]com/[^[:space:][:cntrl:]]+$' THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid supporter request'; END IF;
  SELECT * INTO a FROM public.supporter_accounts WHERE member_id=p_actor AND scope=p_scope FOR UPDATE;
  SELECT * INTO t FROM public.supporter_portal_attempts WHERE account_id=a.id AND request_id=p_request_id;
  IF t.request_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Supporter request unavailable'; END IF;
  IF t.session_id IS NOT NULL THEN
    IF t.session_id<>p_session_id OR t.session_url<>p_session_url THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Supporter request conflict'; END IF;
    RETURN public._supporter_state(a.id,NULL,p_request_id)||jsonb_build_object('replayed',true); END IF;
  UPDATE public.supporter_portal_attempts SET status='ready',session_id=p_session_id,session_url=p_session_url WHERE account_id=a.id AND request_id=p_request_id;
  UPDATE public.supporter_accounts SET revision=revision+1 WHERE id=a.id;
  RETURN public._supporter_state(a.id,NULL,p_request_id)||jsonb_build_object('replayed',false);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Supporter ownership conflict';
END $$;

CREATE FUNCTION public.soe_supporter_portal_unknown(p_actor uuid,p_scope text,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE a public.supporter_accounts; t public.supporter_portal_attempts;
BEGIN
  PERFORM public._supporter_validate_actor(p_actor,p_scope);
  SELECT * INTO a FROM public.supporter_accounts WHERE member_id=p_actor AND scope=p_scope FOR UPDATE;
  SELECT * INTO t FROM public.supporter_portal_attempts WHERE account_id=a.id AND request_id=p_request_id;
  IF t.request_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Supporter request unavailable'; END IF;
  IF t.status='pending' THEN
    UPDATE public.supporter_portal_attempts SET status='unknown' WHERE account_id=a.id AND request_id=p_request_id;
    UPDATE public.supporter_accounts SET revision=revision+1 WHERE id=a.id;
  END IF;
  RETURN public._supporter_state(a.id,NULL,p_request_id);
END $$;

CREATE FUNCTION public.soe_supporter_apply_event(p_scope text,p_event_id text,p_payload_hash text,p_account_id uuid,p_customer_id text,
 p_expected_revision bigint,p_event_kind text,p_snapshot jsonb,p_attempt_request_id uuid DEFAULT NULL,p_attempt_status text DEFAULT NULL,
 p_session_id text DEFAULT NULL,p_session_url text DEFAULT NULL,p_session_expires_at timestamptz DEFAULT NULL,
 p_session_subscription_id text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE a public.supporter_accounts; e public.supporter_webhook_receipts; t public.supporter_checkout_attempts;
 v_start timestamptz; v_end timestamptz; v_paid boolean; v_cancel boolean;
BEGIN
  IF p_scope IS NULL OR length(p_scope)>100 OR p_scope !~ '^(test|live):acct_[A-Za-z0-9]+$' OR p_event_id IS NULL
    OR length(p_event_id)>200 OR p_event_id !~ '^evt_[A-Za-z0-9]+$' OR p_payload_hash IS NULL OR p_payload_hash !~ '^[a-f0-9]{64}$'
    OR p_account_id IS NULL OR p_customer_id IS NULL OR p_customer_id !~ '^cus_[A-Za-z0-9]+$' OR p_expected_revision IS NULL
    OR p_expected_revision<0 OR p_event_kind IS NULL OR p_event_kind NOT IN ('checkout','subscription','invoice','risk') THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid supporter event'; END IF;
  -- Account first, then receipt/attempt, for the same lock order as checkout.
  SELECT * INTO a FROM public.supporter_accounts WHERE id=p_account_id AND scope=p_scope FOR UPDATE;
  IF a.id IS NULL OR a.customer_id IS NULL OR a.customer_id<>p_customer_id THEN
    RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Supporter account unavailable'; END IF;
  SELECT * INTO e FROM public.supporter_webhook_receipts WHERE scope=p_scope AND event_id=p_event_id;
  IF e.event_id IS NOT NULL THEN
    -- The signed bytes identify the event. A later provider re-read can reveal
    -- new risk and change the derived kind; that must not break exact receipt replay.
    IF e.payload_hash<>p_payload_hash OR e.account_id<>p_account_id OR e.customer_id<>p_customer_id THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Supporter event conflict'; END IF;
    RETURN public._supporter_state(a.id)||jsonb_build_object('replayed',true,'appliedRevision',e.applied_revision);
  END IF;
  IF a.revision<>p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Supporter state changed'; END IF;
  IF (p_attempt_request_id IS NULL)<>(p_attempt_status IS NULL) OR (p_attempt_status IS NOT NULL AND p_attempt_status NOT IN ('completed','expired')) THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid supporter event'; END IF;
  IF p_attempt_request_id IS NULL AND (p_session_id IS NOT NULL OR p_session_url IS NOT NULL OR p_session_expires_at IS NOT NULL OR p_session_subscription_id IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid supporter event'; END IF;
  IF p_attempt_request_id IS NOT NULL THEN
    IF (p_attempt_status='completed' AND (p_session_subscription_id IS NULL OR length(p_session_subscription_id)>200
      OR p_session_subscription_id !~ '^sub_[A-Za-z0-9]+$')) OR (p_attempt_status<>'completed' AND p_session_subscription_id IS NOT NULL) THEN
      RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid supporter event'; END IF;
    SELECT * INTO t FROM public.supporter_checkout_attempts WHERE account_id=a.id AND request_id=p_attempt_request_id;
    IF t.request_id IS NULL OR t.customer_id IS DISTINCT FROM p_customer_id OR t.status NOT IN ('pending','ready','unknown',p_attempt_status) THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Supporter request conflict'; END IF;
    IF t.status='completed' AND t.subscription_id IS DISTINCT FROM p_session_subscription_id THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Supporter request conflict'; END IF;
    IF t.session_id IS NULL THEN
      IF p_session_id IS NULL OR length(p_session_id)>200 OR p_session_id !~ '^cs_(test_|live_)?[A-Za-z0-9]+$'
        OR p_session_expires_at IS DISTINCT FROM t.expires_at OR (p_session_url IS NOT NULL AND
          (length(p_session_url)>2048 OR p_session_url !~ '^https://checkout[.]stripe[.]com/[^[:space:][:cntrl:]]+$')) THEN
        RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid supporter event'; END IF;
    ELSIF (p_session_id IS NOT NULL AND p_session_id<>t.session_id) OR (p_session_expires_at IS NOT NULL AND p_session_expires_at<>t.expires_at)
      OR (p_session_url IS NOT NULL AND t.session_url IS DISTINCT FROM p_session_url) THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Supporter request conflict';
    END IF;
  END IF;
  IF p_snapshot IS NOT NULL THEN
    IF jsonb_typeof(p_snapshot)<>'object' OR NOT p_snapshot ?& ARRAY['id','status','cancelAtPeriodEnd','currentPeriodStart','currentPeriodEnd','paid']
      OR (p_snapshot-ARRAY['id','status','cancelAtPeriodEnd','currentPeriodStart','currentPeriodEnd','paid'])<>'{}'::jsonb
      OR jsonb_typeof(p_snapshot->'id')<>'string' OR (p_snapshot->>'id') !~ '^sub_[A-Za-z0-9]+$' OR length(p_snapshot->>'id')>200
      OR jsonb_typeof(p_snapshot->'status')<>'string' OR (p_snapshot->>'status') NOT IN ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')
      OR jsonb_typeof(p_snapshot->'cancelAtPeriodEnd')<>'boolean' OR jsonb_typeof(p_snapshot->'paid')<>'boolean'
      OR jsonb_typeof(p_snapshot->'currentPeriodStart') NOT IN ('string','null') OR jsonb_typeof(p_snapshot->'currentPeriodEnd') NOT IN ('string','null') THEN
      RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid supporter snapshot'; END IF;
    BEGIN
      v_start:=(p_snapshot->>'currentPeriodStart')::timestamptz; v_end:=(p_snapshot->>'currentPeriodEnd')::timestamptz;
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid supporter snapshot'; END;
    v_paid:=(p_snapshot->>'paid')::boolean; v_cancel:=(p_snapshot->>'cancelAtPeriodEnd')::boolean;
    IF (v_start IS NULL)<>(v_end IS NULL) OR (v_start IS NOT NULL AND (NOT isfinite(v_start) OR NOT isfinite(v_end) OR v_end<=v_start
       OR v_end>v_start+interval '2 years')) OR (v_paid AND p_snapshot->>'status' NOT IN ('active','past_due','canceled','unpaid','paused')) THEN
      RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid supporter snapshot'; END IF;
    IF EXISTS(SELECT 1 FROM public.supporter_subscriptions WHERE account_id=a.id AND subscription_id<>p_snapshot->>'id'
      AND status NOT IN ('canceled','incomplete_expired')) THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Existing supporter subscription requires review'; END IF;
    INSERT INTO public.supporter_subscriptions(account_id,scope,subscription_id,status,cancel_at_period_end,current_period_start,current_period_end,paid)
      VALUES(a.id,p_scope,p_snapshot->>'id',p_snapshot->>'status',v_cancel,v_start,v_end,v_paid)
      ON CONFLICT(account_id) DO UPDATE SET subscription_id=EXCLUDED.subscription_id,status=EXCLUDED.status,
        cancel_at_period_end=EXCLUDED.cancel_at_period_end,current_period_start=EXCLUDED.current_period_start,
        current_period_end=EXCLUDED.current_period_end,paid=EXCLUDED.paid,updated_at=transaction_timestamp();
  ELSIF p_event_kind IN ('subscription','invoice') THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Verified subscription snapshot required';
  END IF;
  IF p_attempt_request_id IS NOT NULL THEN
    UPDATE public.supporter_checkout_attempts SET status=p_attempt_status,session_id=coalesce(session_id,p_session_id),
      session_url=coalesce(session_url,p_session_url),session_expires_at=coalesce(session_expires_at,p_session_expires_at),
      subscription_id=p_session_subscription_id,resolved_at=coalesce(resolved_at,transaction_timestamp())
      WHERE account_id=a.id AND request_id=p_attempt_request_id;
  END IF;
  -- A verified terminal snapshot closes only the exact completed subscription,
  -- after completion was recorded. Preserve this proof when a later current
  -- subscription replaces the single account snapshot; it is never time-guessed.
  IF p_snapshot IS NOT NULL AND p_snapshot->>'status' IN ('canceled','incomplete_expired') THEN
    UPDATE public.supporter_checkout_attempts SET terminal_verified_at=coalesce(terminal_verified_at,transaction_timestamp())
      WHERE account_id=a.id AND status='completed' AND subscription_id=p_snapshot->>'id' AND resolved_at<=transaction_timestamp();
  END IF;
  UPDATE public.supporter_accounts SET revision=revision+1,risk_review=risk_review OR p_event_kind='risk' WHERE id=a.id;
  INSERT INTO public.supporter_webhook_receipts(scope,event_id,payload_hash,account_id,customer_id,event_kind,applied_revision)
    VALUES(p_scope,p_event_id,p_payload_hash,a.id,p_customer_id,p_event_kind,a.revision+1);
  RETURN public._supporter_state(a.id)||jsonb_build_object('replayed',false,'appliedRevision',a.revision+1);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Supporter event conflict';
END $$;

-- No browser role can invoke helpers or billing mutations. Grants are explicit;
-- a deployment must not rely on mutable project-wide default privileges.
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname ~ '^(soe_supporter_|_supporter_)' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
  END LOOP;
END $$;
COMMIT;
