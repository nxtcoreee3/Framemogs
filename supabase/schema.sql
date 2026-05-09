-- Framemogs (GitHub Pages) Supabase schema
-- 1) In Supabase SQL Editor, run this entire file.
-- 2) Replace the owner user id value below after your first sign-in.

-- Extensions
create extension if not exists pgcrypto;

-- App config (singleton-ish)
create table if not exists app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into app_config(key, value)
values ('owner_user_id', '__OWNER_USER_ID__')
on conflict (key) do nothing;

-- Enums
do $$
begin
  if not exists (select 1 from pg_type where typname = 'profile_kind') then
    create type profile_kind as enum ('user', 'celebrity');
  end if;
  if not exists (select 1 from pg_type where typname = 'profile_status') then
    create type profile_status as enum ('pending', 'approved', 'removed');
  end if;
  if not exists (select 1 from pg_type where typname = 'request_status') then
    create type request_status as enum ('pending', 'approved', 'rejected');
  end if;
end $$;

-- Roles
create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role text not null check (role in ('mod')),
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

-- Profiles
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  kind profile_kind not null,
  status profile_status not null default 'approved',
  user_id uuid null, -- auth.users.id for user profiles
  handle text not null unique,
  display_name text not null,
  bio text not null default '',
  photo_url text null,
  photo_path text null,
  created_at timestamptz not null default now(),
  created_by uuid null, -- auth uid
  created_by_mod uuid null,
  removed_at timestamptz null,
  removed_by uuid null
);

-- One user profile per auth user (celebrities have NULL user_id, which does not violate uniqueness)
do $$
begin
  if not exists (
    select 1 from pg_indexes where schemaname='public' and indexname='profiles_user_id_unique'
  ) then
    create unique index profiles_user_id_unique on profiles(user_id) where user_id is not null;
  end if;
end $$;

-- Profile requests (user uploads)
create table if not exists profile_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null,
  handle text not null,
  display_name text not null,
  bio text not null default '',
  photo_url text null,
  photo_path text null,
  scan_meta jsonb not null default '{}'::jsonb,
  attested_adult boolean not null default false,
  status request_status not null default 'pending',
  created_at timestamptz not null default now(),
  decided_by uuid null,
  decided_at timestamptz null,
  reject_reason text null,
  unique (handle)
);

-- Only one pending request per user
do $$
begin
  if not exists (
    select 1 from pg_indexes where schemaname='public' and indexname='profile_requests_one_pending_per_user'
  ) then
    create unique index profile_requests_one_pending_per_user
      on profile_requests(requester_id)
      where status = 'pending';
  end if;
end $$;

-- Votes
create table if not exists votes (
  profile_id uuid not null references profiles(id) on delete cascade,
  voter_id uuid not null,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, voter_id)
);

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_votes_updated on votes;
create trigger trg_votes_updated before update on votes
for each row execute procedure set_updated_at();

-- Vote totals (public safe aggregate; avoids exposing voter_id)
create table if not exists profile_vote_totals (
  profile_id uuid primary key references profiles(id) on delete cascade,
  upvotes int not null default 0,
  downvotes int not null default 0,
  score int not null default 0,
  updated_at timestamptz not null default now()
);

-- Lock down base privileges (clients should only read via SELECT)
revoke all on table profile_vote_totals from anon, authenticated;
grant select on table profile_vote_totals to anon, authenticated;

create or replace function recompute_vote_totals(pid uuid)
returns void language plpgsql security definer as $$
declare
  u int;
  d int;
  s int;
begin
  select
    coalesce(sum(case when value=1 then 1 else 0 end),0),
    coalesce(sum(case when value=-1 then 1 else 0 end),0),
    coalesce(sum(value),0)
  into u,d,s
  from votes where profile_id = pid;

  insert into profile_vote_totals(profile_id, upvotes, downvotes, score, updated_at)
  values (pid, u, d, s, now())
  on conflict (profile_id) do update
    set upvotes=excluded.upvotes, downvotes=excluded.downvotes, score=excluded.score, updated_at=now();
end $$;

create or replace function trg_votes_recompute()
returns trigger language plpgsql security definer as $$
begin
  if (tg_op = 'DELETE') then
    perform recompute_vote_totals(old.profile_id);
    return old;
  elsif (tg_op = 'UPDATE') then
    perform recompute_vote_totals(new.profile_id);
    if old.profile_id is distinct from new.profile_id then
      perform recompute_vote_totals(old.profile_id);
    end if;
    return new;
  else
    perform recompute_vote_totals(new.profile_id);
    return new;
  end if;
end $$;

drop trigger if exists trg_votes_recompute_aiud on votes;
create trigger trg_votes_recompute_aiud
after insert or update or delete on votes
for each row execute procedure trg_votes_recompute();

-- Comments
create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  author_id uuid not null,
  body text not null,
  created_at timestamptz not null default now(),
  removed boolean not null default false,
  removed_by uuid null,
  removed_at timestamptz null
);

-- Follows
create table if not exists follows (
  follower_id uuid not null,
  followed_profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_profile_id)
);

-- Celebrity details
create table if not exists celebrity_details (
  profile_id uuid primary key references profiles(id) on delete cascade,
  mod_name text not null default '',
  social text not null default '',
  age int null,
  summary text not null default '',
  updated_by uuid null,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_celeb_updated on celebrity_details;
create trigger trg_celeb_updated before update on celebrity_details
for each row execute procedure set_updated_at();

-- Helper: role checks
create or replace function is_owner()
returns boolean language sql stable as $$
  select auth.uid() is not null
     and auth.uid()::text = (select value from app_config where key='owner_user_id' limit 1);
$$;

create or replace function is_mod()
returns boolean language sql stable as $$
  select is_owner()
     or exists (select 1 from roles r where r.user_id = auth.uid() and r.role='mod');
$$;

-- Views used by the web app
create or replace view public_profile_cards as
select
  p.id as profile_id,
  p.kind,
  p.handle,
  p.display_name,
  p.bio,
  p.photo_url,
  coalesce(t.upvotes, 0)::int as upvotes,
  coalesce(t.downvotes, 0)::int as downvotes,
  coalesce(t.score, 0)::int as score
from profiles p
left join profile_vote_totals t on t.profile_id = p.id
where p.status = 'approved';

create or replace view comments_view as
select
  c.id,
  c.profile_id,
  c.body,
  c.created_at,
  ap.handle as author_handle,
  ap.display_name as author_display
from comments c
left join profiles ap on ap.user_id = c.author_id and ap.status='approved'
where c.removed = false;

create or replace view following_cards as
select
  f.follower_id,
  pc.*
from follows f
join public_profile_cards pc on pc.profile_id = f.followed_profile_id;

-- RPCs for moderator actions (safer than client-side multi-step)
create or replace function approve_profile_request(request_id uuid, moderator_id uuid)
returns void language plpgsql security definer as $$
declare
  r profile_requests%rowtype;
begin
  if not is_mod() then
    raise exception 'not authorized';
  end if;
  if moderator_id is distinct from auth.uid() then
    raise exception 'moderator mismatch';
  end if;

  select * into r from profile_requests where id = request_id for update;
  if r.id is null then
    raise exception 'request not found';
  end if;
  if r.status <> 'pending' then
    raise exception 'request not pending';
  end if;
  if r.attested_adult is distinct from true then
    raise exception 'adult attestation required';
  end if;
  if exists (select 1 from profiles p where p.user_id = r.requester_id) then
    raise exception 'profile already exists for this user';
  end if;

  insert into profiles(kind, status, user_id, handle, display_name, bio, photo_url, photo_path, created_by, created_by_mod)
  values ('user', 'approved', r.requester_id, r.handle, r.display_name, r.bio, r.photo_url, r.photo_path, r.requester_id, moderator_id);

  update profile_requests
  set status='approved', decided_by=moderator_id, decided_at=now()
  where id=request_id;
end $$;

revoke all on function approve_profile_request(uuid, uuid) from public;
grant execute on function approve_profile_request(uuid, uuid) to authenticated;

create or replace function create_celebrity_profile(moderator_id uuid, handle text, display_name text, bio text, photo_url text, photo_path text)
returns void language plpgsql security definer as $$
begin
  if not is_mod() then
    raise exception 'not authorized';
  end if;
  if moderator_id is distinct from auth.uid() then
    raise exception 'moderator mismatch';
  end if;

  insert into profiles(kind, status, user_id, handle, display_name, bio, photo_url, photo_path, created_by, created_by_mod)
  values ('celebrity', 'approved', null, handle, display_name, coalesce(bio,''), photo_url, photo_path, auth.uid(), moderator_id);
end $$;

revoke all on function create_celebrity_profile(uuid, text, text, text, text, text) from public;
grant execute on function create_celebrity_profile(uuid, text, text, text, text, text) to authenticated;

-- RLS
alter table roles enable row level security;
alter table profiles enable row level security;
alter table profile_requests enable row level security;
alter table votes enable row level security;
alter table comments enable row level security;
alter table follows enable row level security;
alter table celebrity_details enable row level security;

-- profile_vote_totals: relies on revoked write privileges (no RLS to avoid trigger/definer friction)

-- roles: owner manages
drop policy if exists roles_select on roles;
create policy roles_select on roles for select using (is_owner());
drop policy if exists roles_insert on roles;
create policy roles_insert on roles for insert with check (is_owner());
drop policy if exists roles_delete on roles;
create policy roles_delete on roles for delete using (is_owner());

-- profiles: public can read approved profiles via view; allow select for approved
drop policy if exists profiles_select_public on profiles;
create policy profiles_select_public on profiles for select using (status='approved');
-- mods can insert/update/remove
drop policy if exists profiles_mod_write on profiles;
create policy profiles_mod_write on profiles for all using (is_mod()) with check (is_mod());

-- profile_requests: requester can insert and see own; mods can view all pending
drop policy if exists req_insert on profile_requests;
create policy req_insert on profile_requests for insert with check (auth.uid() = requester_id);
drop policy if exists req_select on profile_requests;
create policy req_select on profile_requests for select using (auth.uid() = requester_id or is_mod());
drop policy if exists req_update on profile_requests;
create policy req_update on profile_requests for update using (is_mod()) with check (is_mod());

-- votes: anyone can read aggregated via view; keep votes readable only to mods for audits
drop policy if exists votes_select on votes;
create policy votes_select on votes for select using (is_mod());
drop policy if exists votes_upsert on votes;
create policy votes_upsert on votes for insert with check (
  auth.uid() = voter_id
  and exists (select 1 from profiles p where p.id = profile_id and p.status='approved')
);
drop policy if exists votes_update on votes;
create policy votes_update on votes for update using (auth.uid() = voter_id) with check (
  auth.uid() = voter_id
  and exists (select 1 from profiles p where p.id = profile_id and p.status='approved')
);
drop policy if exists votes_delete on votes;
create policy votes_delete on votes for delete using (auth.uid() = voter_id);

-- comments: public can read via view; inserts by auth users, deletes/updates by mods
drop policy if exists comments_select on comments;
create policy comments_select on comments for select using (exists (select 1 from profiles p where p.id = profile_id and p.status='approved'));
drop policy if exists comments_insert on comments;
create policy comments_insert on comments for insert with check (
  auth.uid() = author_id
  and exists (select 1 from profiles p where p.id = profile_id and p.status='approved')
);
drop policy if exists comments_mod_update on comments;
create policy comments_mod_update on comments for update using (is_mod()) with check (is_mod());
drop policy if exists comments_mod_delete on comments;
create policy comments_mod_delete on comments for delete using (is_mod());

-- follows: auth users manage their own follows; everyone can read their own follows
drop policy if exists follows_select on follows;
create policy follows_select on follows for select using (auth.uid() = follower_id);
drop policy if exists follows_insert on follows;
create policy follows_insert on follows for insert with check (auth.uid() = follower_id);
drop policy if exists follows_delete on follows;
create policy follows_delete on follows for delete using (auth.uid() = follower_id);

-- celebrity_details: public can read, mods can write
drop policy if exists celeb_select on celebrity_details;
create policy celeb_select on celebrity_details for select using (true);
drop policy if exists celeb_write on celebrity_details;
create policy celeb_write on celebrity_details for all using (is_mod()) with check (is_mod());

-- NOTE: Storage bucket policies must be configured in Supabase UI:
-- Bucket: profile_photos
-- Public: true (so GitHub Pages can show images), or use signed URLs with Edge Functions.
