create table if not exists public.consented_match_projections (
  member_id uuid primary key references public.members(id) on delete cascade,
  epistemic_vectors jsonb not null,
  primary_builder_archetype text not null,
  decentralization_conviction numeric not null,
  synergistic_skills text[] not null default '{}',
  updated_at timestamptz not null default now(),

  constraint consented_match_projections_epistemic_vectors_object
    check (jsonb_typeof(epistemic_vectors) = 'object'),

  constraint consented_match_projections_rationalism_vs_empiricism
    check (
      jsonb_typeof(epistemic_vectors -> 'rationalism_vs_empiricism') = 'number'
      and (epistemic_vectors ->> 'rationalism_vs_empiricism')::numeric between -1.0 and 1.0
    ),

  constraint consented_match_projections_risk_acceleration_tolerance
    check (
      jsonb_typeof(epistemic_vectors -> 'risk_acceleration_tolerance') = 'number'
      and (epistemic_vectors ->> 'risk_acceleration_tolerance')::numeric between -1.0 and 1.0
    ),

  constraint consented_match_projections_open_source_conviction
    check (
      jsonb_typeof(epistemic_vectors -> 'open_source_conviction') = 'number'
      and (epistemic_vectors ->> 'open_source_conviction')::numeric between -1.0 and 1.0
    ),

  constraint consented_match_projections_builder_archetype
    check (
      primary_builder_archetype in (
        'Systems Architect',
        'Visionary Philosopher',
        'Algorithmic Operator',
        'Growth Catalyst'
      )
    ),

  constraint consented_match_projections_decentralization_conviction
    check (decentralization_conviction between -1.0 and 1.0)
);

create index if not exists consented_match_projections_builder_archetype_idx
  on public.consented_match_projections (primary_builder_archetype);

create index if not exists consented_match_projections_updated_at_idx
  on public.consented_match_projections (updated_at desc);

create or replace function public.set_consented_match_projections_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_consented_match_projections_updated_at
  on public.consented_match_projections;

create trigger set_consented_match_projections_updated_at
before update on public.consented_match_projections
for each row
execute function public.set_consented_match_projections_updated_at();
