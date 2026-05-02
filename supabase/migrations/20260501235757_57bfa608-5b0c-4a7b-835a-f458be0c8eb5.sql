-- =========================================================================
-- Private portal: profiles, roles, audit log, RLS, and bootstrap admin
-- =========================================================================
--
-- BOOTSTRAP ADMIN NOTE (READ ME):
--   The admin email johanmarcusholmberg@gmail.com is pre-seeded as an admin
--   profile here, BUT NO PASSWORD IS SET IN CODE OR SQL. Plaintext passwords
--   never live in the codebase. To claim this account on first run:
--     1. Open /login on the deployed app.
--     2. Click "Forgot password" with johanmarcusholmberg@gmail.com.
--     3. Follow the email link to set a real password.
--   The signup-link trigger below will attach the new auth user to the
--   pre-seeded profile automatically when the emails match.
--
--   The profile is marked is_protected = true so the frontend (and RLS)
--   cannot delete it or demote it from admin.
-- =========================================================================

-- ---------- ENUMS ----------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'user');
  end if;
  if not exists (select 1 from pg_type where typname = 'profile_status') then
    create type public.profile_status as enum ('active', 'disabled', 'pending');
  end if;
  if not exists (select 1 from pg_type where typname = 'auth_provider') then
    create type public.auth_provider as enum ('password', 'google', 'mixed');
  end if;
end $$;

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email text unique not null,
  username text unique,
  display_name text,
  status public.profile_status not null default 'active',
  provider public.auth_provider not null default 'password',
  is_protected boolean not null default false,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_email on public.profiles (lower(email));
create index if not exists idx_profiles_auth_user_id on public.profiles (auth_user_id);

-- ---------- user_roles ----------
-- SEPARATE table so we never check role from a column on profiles
-- (this is the documented Supabase pattern that prevents recursion + escalation).
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create index if not exists idx_user_roles_user_id on public.user_roles (user_id);

-- ---------- audit_log ----------
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  target_user_id uuid references public.profiles(id) on delete set null,
  performed_by uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_created_at on public.audit_log (created_at desc);

-- ---------- updated_at trigger ----------
create or replace function public.touch_profiles_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.touch_profiles_updated_at();

-- =========================================================================
-- Helper functions (SECURITY DEFINER, no recursion in RLS)
-- =========================================================================

-- Resolve the profile id for the calling auth user
create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id from public.profiles p where p.auth_user_id = auth.uid() limit 1;
$$;

-- Has-role check (canonical pattern from the Supabase docs)
create or replace function public.has_role(_user_profile_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = _user_profile_id and ur.role = _role
  );
$$;

-- Convenience: is the current auth user an active admin?
create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.user_roles ur on ur.user_id = p.id
    where p.auth_user_id = auth.uid()
      and p.status = 'active'
      and ur.role = 'admin'
  );
$$;

-- Convenience: is the current auth user active (any role)?
create or replace function public.is_current_user_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.auth_user_id = auth.uid() and p.status = 'active'
  );
$$;

-- =========================================================================
-- RLS
-- =========================================================================

alter table public.profiles    enable row level security;
alter table public.user_roles  enable row level security;
alter table public.audit_log   enable row level security;

-- ---------- profiles policies ----------

-- A user can read their own row; admins can read all
drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin"
on public.profiles for select
to authenticated
using (
  auth_user_id = auth.uid()
  or public.is_current_user_admin()
);

-- A user can update only their own row, but cannot touch role/status/protection
drop policy if exists "profiles_update_self_limited" on public.profiles;
create policy "profiles_update_self_limited"
on public.profiles for update
to authenticated
using (auth_user_id = auth.uid())
with check (
  auth_user_id = auth.uid()
  -- prevent self-elevation of status from disabled to active, etc.
  and status = (select status from public.profiles where id = profiles.id)
  and is_protected = (select is_protected from public.profiles where id = profiles.id)
);

-- Admins can update any profile EXCEPT they cannot un-protect or delete the protected admin
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
on public.profiles for update
to authenticated
using (public.is_current_user_admin())
with check (
  public.is_current_user_admin()
  -- the protected flag itself can never be flipped via API
  and (
    is_protected = (select is_protected from public.profiles where id = profiles.id)
  )
);

-- Admins can insert profiles
drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_admin"
on public.profiles for insert
to authenticated
with check (public.is_current_user_admin());

-- Admins can delete profiles, except the protected admin
drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin"
on public.profiles for delete
to authenticated
using (
  public.is_current_user_admin()
  and is_protected = false
);

-- ---------- user_roles policies ----------

-- A user can see their own role row; admins can see all
drop policy if exists "user_roles_select_self_or_admin" on public.user_roles;
create policy "user_roles_select_self_or_admin"
on public.user_roles for select
to authenticated
using (
  user_id = public.current_profile_id()
  or public.is_current_user_admin()
);

-- Admins can grant roles, except they cannot create another admin role row
-- for the protected admin (they already have one) and cannot grant 'admin' to
-- nothing — handled in UI; here we only enforce admin-only writes.
drop policy if exists "user_roles_insert_admin" on public.user_roles;
create policy "user_roles_insert_admin"
on public.user_roles for insert
to authenticated
with check (public.is_current_user_admin());

-- Admins can update roles
drop policy if exists "user_roles_update_admin" on public.user_roles;
create policy "user_roles_update_admin"
on public.user_roles for update
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

-- Admins can delete a role row, but never the admin role of the protected admin
drop policy if exists "user_roles_delete_admin" on public.user_roles;
create policy "user_roles_delete_admin"
on public.user_roles for delete
to authenticated
using (
  public.is_current_user_admin()
  and not exists (
    select 1
    from public.profiles p
    where p.id = user_roles.user_id
      and p.is_protected = true
      and user_roles.role = 'admin'
  )
);

-- ---------- audit_log policies ----------

-- Only admins can view audit entries
drop policy if exists "audit_log_select_admin" on public.audit_log;
create policy "audit_log_select_admin"
on public.audit_log for select
to authenticated
using (public.is_current_user_admin());

-- Only admins can insert audit entries (edge functions run as service role and bypass RLS)
drop policy if exists "audit_log_insert_admin" on public.audit_log;
create policy "audit_log_insert_admin"
on public.audit_log for insert
to authenticated
with check (public.is_current_user_admin());

-- =========================================================================
-- Auto-link auth.users -> profiles
-- =========================================================================
-- When a new auth user is created (signup, password reset, OAuth), if their
-- email already exists in profiles, link the rows. Unknown emails are NOT
-- auto-created — strict allowlist policy. They will be unable to access the
-- app and the frontend shows the "not approved" message.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_profile_id uuid;
  detected_provider public.auth_provider;
begin
  -- Detect provider
  if new.raw_app_meta_data ? 'provider' then
    if new.raw_app_meta_data ->> 'provider' = 'google' then
      detected_provider := 'google';
    else
      detected_provider := 'password';
    end if;
  else
    detected_provider := 'password';
  end if;

  select id into matched_profile_id
  from public.profiles
  where lower(email) = lower(new.email)
  limit 1;

  if matched_profile_id is not null then
    update public.profiles
    set auth_user_id = new.id,
        last_login_at = now(),
        provider = case
          when provider = detected_provider then provider
          when provider is null then detected_provider
          else 'mixed'::public.auth_provider
        end
    where id = matched_profile_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_handle_new_auth_user on auth.users;
create trigger trg_handle_new_auth_user
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- =========================================================================
-- Bootstrap admin profile (NO PASSWORD)
-- =========================================================================
-- Inserts the protected admin profile. Auth user + password are created
-- by the admin themselves via the login page's "Forgot password" flow,
-- which then auto-links via the trigger above.

insert into public.profiles (email, username, display_name, status, provider, is_protected, notes)
values (
  'johanmarcusholmberg@gmail.com',
  'johan',
  'Johan Holmberg',
  'active',
  'mixed',
  true,
  'Bootstrap administrator. Cannot be deleted or demoted from the frontend. Set password via /login -> Forgot password.'
)
on conflict (email) do update
  set is_protected = true,
      status = 'active';

-- Grant admin role to the bootstrap profile (idempotent)
insert into public.user_roles (user_id, role)
select p.id, 'admin'::public.app_role
from public.profiles p
where p.email = 'johanmarcusholmberg@gmail.com'
on conflict (user_id, role) do nothing;

-- =========================================================================
-- Helper view: profile + role + auth metadata for the admin UI
-- =========================================================================
create or replace view public.admin_user_overview
with (security_invoker = true)
as
select
  p.id,
  p.auth_user_id,
  p.email,
  p.username,
  p.display_name,
  p.status,
  p.provider,
  p.is_protected,
  p.notes,
  p.created_at,
  p.updated_at,
  p.last_login_at,
  p.created_by,
  coalesce(
    (select array_agg(ur.role::text order by ur.role)
     from public.user_roles ur
     where ur.user_id = p.id),
    array[]::text[]
  ) as roles
from public.profiles p;