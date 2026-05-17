-- 1. Ensure core project workspace registry exists to support upstream scaffolding
create table if not exists public.project_workspaces (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  workspace_status text not null default 'proposed',
  creator_member_id uuid not null references public.members(id) on delete cascade,
  partner_member_id uuid not null references public.members(id) on delete cascade,
  multisig_config jsonb not null default '{}'::jsonb,
  milestone_definitions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint project_workspaces_status_enum check (
    workspace_status in ('proposed', 'active', 'paused', 'completed', 'terminated')
  ),
  constraint project_workspaces_multisig_object check (
    jsonb_typeof(multisig_config) = 'object'
  ),
  constraint project_workspaces_milestones_array check (
    jsonb_typeof(milestone_definitions) = 'array'
  ),
  constraint project_workspaces_distinct_partners check (
    creator_member_id <> partner_member_id
  )
);

-- 2. Create zero-knowledge public inbox bucket for ephemeral signaling mechanics
create table if not exists public.member_inbox_signals (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.members(id) on delete cascade,
  sender_match_hash text not null,
  encrypted_invite_payload text not null,
  signal_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint member_inbox_signals_status_enum check (
    signal_status in ('pending', 'accepted', 'declined', 'expired')
  ),
  constraint member_inbox_signals_sender_match_hash_sha256 check (
    sender_match_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint member_inbox_signals_payload_size check (
    octet_length(encrypted_invite_payload) between 1 and 65536
  )
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'member_inbox_signals_sender_match_hash_sha256'
      and conrelid = 'public.member_inbox_signals'::regclass
  ) then
    alter table public.member_inbox_signals
      add constraint member_inbox_signals_sender_match_hash_sha256
      check (sender_match_hash ~ '^[0-9a-f]{64}$')
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'member_inbox_signals_payload_size'
      and conrelid = 'public.member_inbox_signals'::regclass
  ) then
    alter table public.member_inbox_signals
      add constraint member_inbox_signals_payload_size
      check (octet_length(encrypted_invite_payload) between 1 and 65536)
      not valid;
  end if;
end $$;

-- 3. Performance and isolation optimization boundaries
create index if not exists project_workspaces_creator_idx
  on public.project_workspaces(creator_member_id);

create index if not exists project_workspaces_partner_idx
  on public.project_workspaces(partner_member_id);

create index if not exists member_inbox_signals_recipient_status_idx
  on public.member_inbox_signals(recipient_id, signal_status);

create index if not exists member_inbox_signals_pending_match_hash_idx
  on public.member_inbox_signals(recipient_id, sender_match_hash)
  where signal_status = 'pending';

-- 4. Automatic modification time sync triggers
create or replace function public.set_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_project_workspaces_updated_at on public.project_workspaces;
create trigger set_project_workspaces_updated_at
  before update on public.project_workspaces
  for each row
  execute function public.set_updated_at_column();

drop trigger if exists set_member_inbox_signals_updated_at on public.member_inbox_signals;
create trigger set_member_inbox_signals_updated_at
  before update on public.member_inbox_signals
  for each row
  execute function public.set_updated_at_column();

-- 5. RLS boundaries for public-schema tables exposed through Supabase APIs
alter table public.project_workspaces enable row level security;
alter table public.member_inbox_signals enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'project_workspaces'
      and policyname = 'project_workspaces_service_role_all'
  ) then
    create policy "project_workspaces_service_role_all"
      on public.project_workspaces
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'project_workspaces'
      and policyname = 'project_workspaces_participant_read'
  ) then
    create policy "project_workspaces_participant_read"
      on public.project_workspaces
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.members
          where members.supabase_auth_id = auth.uid()
            and members.id in (
              project_workspaces.creator_member_id,
              project_workspaces.partner_member_id
            )
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'member_inbox_signals'
      and policyname = 'member_inbox_signals_service_role_all'
  ) then
    create policy "member_inbox_signals_service_role_all"
      on public.member_inbox_signals
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'member_inbox_signals'
      and policyname = 'member_inbox_signals_recipient_read'
  ) then
    create policy "member_inbox_signals_recipient_read"
      on public.member_inbox_signals
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.members
          where members.supabase_auth_id = auth.uid()
            and members.id = member_inbox_signals.recipient_id
        )
      );
  end if;
end $$;

create schema if not exists private;

create or replace function private.create_project_invitation_v1(
  p_creator_member_id uuid,
  p_partner_member_id uuid,
  p_title text,
  p_description text,
  p_multisig_config jsonb,
  p_milestone_definitions jsonb,
  p_sender_match_hash text,
  p_encrypted_invite_payload text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  now_ts timestamptz := now();
  existing_signal_id uuid;
  inserted_project_id uuid;
  inserted_signal_id uuid;
begin
  if p_creator_member_id is null or p_partner_member_id is null then
    raise exception 'creator and partner member ids are required' using errcode = '22023';
  end if;

  if p_creator_member_id = p_partner_member_id then
    raise exception 'creator and partner member ids must be distinct' using errcode = '22023';
  end if;

  if p_title is null or length(trim(p_title)) < 3 or length(trim(p_title)) > 120 then
    raise exception 'title must be between 3 and 120 characters' using errcode = '22023';
  end if;

  if p_description is null or length(p_description) > 2000 then
    raise exception 'description must be 2000 characters or fewer' using errcode = '22023';
  end if;

  if p_multisig_config is null or jsonb_typeof(p_multisig_config) <> 'object' then
    raise exception 'multisig_config must be a JSON object' using errcode = '22023';
  end if;

  if p_milestone_definitions is null or jsonb_typeof(p_milestone_definitions) <> 'array' then
    raise exception 'milestone_definitions must be a JSON array' using errcode = '22023';
  end if;

  if jsonb_array_length(p_milestone_definitions) > 25 then
    raise exception 'milestone_definitions cannot exceed 25 entries' using errcode = '22023';
  end if;

  if lower(coalesce(p_sender_match_hash, '')) !~ '^[0-9a-f]{64}$' then
    raise exception 'sender_match_hash must be a sha256 hex digest' using errcode = '22023';
  end if;

  if p_encrypted_invite_payload is null
    or octet_length(p_encrypted_invite_payload) = 0
    or octet_length(p_encrypted_invite_payload) > 65536
  then
    raise exception 'encrypted_invite_payload must be 1-65536 bytes' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      least(p_creator_member_id::text, p_partner_member_id::text)
        || ':'
        || greatest(p_creator_member_id::text, p_partner_member_id::text),
      20260517
    )
  );

  select id
    into existing_signal_id
    from public.member_inbox_signals
    where recipient_id = p_partner_member_id
      and sender_match_hash = lower(p_sender_match_hash)
      and signal_status = 'pending'
    order by created_at desc
    limit 1
    for update;

  if found then
    return jsonb_build_object(
      'accepted', false,
      'status', 'duplicate_pending',
      'project_id', null,
      'signal_id', existing_signal_id,
      'recipient_id', p_partner_member_id,
      'sender_match_hash', lower(p_sender_match_hash),
      'workspace_status', 'proposed',
      'signal_status', 'pending',
      'created_at', now_ts
    );
  end if;

  insert into public.project_workspaces (
    title,
    description,
    workspace_status,
    creator_member_id,
    partner_member_id,
    multisig_config,
    milestone_definitions,
    created_at,
    updated_at
  )
  values (
    trim(p_title),
    p_description,
    'proposed',
    p_creator_member_id,
    p_partner_member_id,
    p_multisig_config,
    p_milestone_definitions,
    now_ts,
    now_ts
  )
  returning id into inserted_project_id;

  insert into public.member_inbox_signals (
    recipient_id,
    sender_match_hash,
    encrypted_invite_payload,
    signal_status,
    created_at,
    updated_at
  )
  values (
    p_partner_member_id,
    lower(p_sender_match_hash),
    p_encrypted_invite_payload,
    'pending',
    now_ts,
    now_ts
  )
  returning id into inserted_signal_id;

  return jsonb_build_object(
    'accepted', true,
    'status', 'created',
    'project_id', inserted_project_id,
    'signal_id', inserted_signal_id,
    'recipient_id', p_partner_member_id,
    'sender_match_hash', lower(p_sender_match_hash),
    'workspace_status', 'proposed',
    'signal_status', 'pending',
    'created_at', now_ts
  );
end;
$$;

revoke all on function private.create_project_invitation_v1(
  uuid,
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  text,
  text
) from public, anon, authenticated;

grant execute on function private.create_project_invitation_v1(
  uuid,
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  text,
  text
) to service_role;

create or replace function public.create_project_invitation_v1(
  p_creator_member_id uuid,
  p_partner_member_id uuid,
  p_title text,
  p_description text,
  p_multisig_config jsonb,
  p_milestone_definitions jsonb,
  p_sender_match_hash text,
  p_encrypted_invite_payload text
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  return private.create_project_invitation_v1(
    p_creator_member_id,
    p_partner_member_id,
    p_title,
    p_description,
    p_multisig_config,
    p_milestone_definitions,
    p_sender_match_hash,
    p_encrypted_invite_payload
  );
end;
$$;

revoke all on function public.create_project_invitation_v1(
  uuid,
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.create_project_invitation_v1(
  uuid,
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  text,
  text
) to service_role;

notify pgrst, 'reload schema';
