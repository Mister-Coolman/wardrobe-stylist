-- Wardrobe Stylist schema (spec §3). All access goes through the server with the service-role key;
-- RLS is on with no policies so the anon key can read nothing.

create table profiles (
  user_id text primary key,
  home_city text not null default '',
  home_lat double precision not null default 0,
  home_lon double precision not null default 0,
  tz text not null default 'UTC',
  person_photo_url text,
  render_mode text not null default 'flatlay' check (render_mode in ('tryon', 'flatlay', 'none')),
  wear_limits jsonb not null default '{}',
  style_profile jsonb
);

create table garments (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  source_media_id uuid,
  name text not null,
  category text not null,
  subcategory text not null,
  colors text[] not null default '{}',
  pattern text not null default 'solid',
  formality smallint not null check (formality between 1 and 5),
  warmth smallint not null check (warmth between 1 and 5),
  rain_safe boolean not null default true,
  tags text[] not null default '{}',
  status text not null default 'clean' check (status in ('clean', 'worn', 'laundry')),
  wear_limit_override int,
  wears_since_wash int not null default 0,
  wear_count int not null default 0,
  last_worn_at date,
  cutout_url text not null default '',
  photo_url text not null default '',
  confirmed boolean not null default false,
  created_at timestamptz not null default now()
);
create index garments_user on garments (user_id);

create table outfits (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  garment_ids text[] not null,
  rationale jsonb not null default '{}',
  title text not null,
  context_date date not null,
  rule_report jsonb not null default '[]',
  revision_log jsonb not null default '[]',
  render_mode text not null default 'none',
  render_url text,
  source text not null default 'agent' check (source in ('agent', 'user')),
  created_at timestamptz not null default clock_timestamp()
);
create index outfits_user_date on outfits (user_id, context_date, created_at desc);

create table wear_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  date date not null,
  outfit_id uuid not null references outfits (id) on delete cascade,
  event_id text,
  people text[] not null default '{}'
);

create table events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  date date not null,
  start_at text,
  end_at text,
  all_day boolean not null default false,
  title text not null,
  location text,
  attendees text[] not null default '{}',
  source text not null default 'user' check (source in ('calendar', 'user')),
  formality smallint
);
create index events_user_date on events (user_id, date);

create table trips (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  destination text not null,
  lat double precision not null,
  lon double precision not null,
  start_date date not null,
  end_date date not null,
  day_plans jsonb not null default '[]',
  packing_list jsonb not null default '[]',
  warnings text[] not null default '{}'
);

create table scan_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  media_url text not null,
  frame_urls text[] not null default '{}',
  status text not null default 'queued' check (status in ('queued', 'segmenting', 'tagging', 'review', 'failed')),
  progress real not null default 0,
  found_count int not null default 0,
  error text
);

-- Stretch (Task 19)
create table polls (
  slug text primary key,
  user_id text not null,
  outfit_ids uuid[] not null,
  event_id text,
  created_at timestamptz not null default now()
);
create table poll_votes (
  slug text not null references polls (slug) on delete cascade,
  outfit_id uuid not null,
  voter_key text not null,
  unique (slug, voter_key)
);

alter table profiles enable row level security;
alter table garments enable row level security;
alter table outfits enable row level security;
alter table wear_logs enable row level security;
alter table events enable row level security;
alter table trips enable row level security;
alter table scan_jobs enable row level security;
alter table polls enable row level security;
alter table poll_votes enable row level security;

-- One transaction: log the wear, bump counters, move pieces at their limit to the laundry.
create or replace function log_wear(p_user text, p_outfit uuid, p_date date, p_event text, p_people text[], p_laundry uuid[])
returns void language plpgsql as $$
declare ids text[];
begin
  select garment_ids into ids from outfits where id = p_outfit and user_id = p_user;
  if ids is null then raise exception 'outfit not found'; end if;
  insert into wear_logs (user_id, date, outfit_id, event_id, people) values (p_user, p_date, p_outfit, p_event, coalesce(p_people, '{}'));
  update garments set
    wear_count = wear_count + 1,
    wears_since_wash = wears_since_wash + 1,
    last_worn_at = p_date,
    status = case when id = any (p_laundry) then 'laundry' else status end
  where user_id = p_user and id::text = any (ids);
end $$;

insert into storage.buckets (id, name, public) values ('media', 'media', false) on conflict do nothing;
