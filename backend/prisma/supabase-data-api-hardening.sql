-- Avalisa Supabase Data API hardening
--
-- Avalisa uses Prisma from the backend server. The dashboard and extension should
-- not read/write Supabase directly through supabase-js, /rest/v1, or GraphQL.
--
-- Run this in the Supabase SQL Editor, or with psql against DIRECT_URL, after
-- creating the Prisma tables. It locks down the auto-generated Data API surface
-- while keeping backend direct Postgres access available.

begin;

-- Existing public objects should not be reachable by Supabase Data API roles.
revoke select, insert, update, delete, truncate, references, trigger
  on all tables in schema public
  from anon, authenticated, service_role;

revoke usage, select
  on all sequences in schema public
  from anon, authenticated, service_role;

revoke execute
  on all functions in schema public
  from anon, authenticated, service_role, public;

-- Future public objects should also default to private from the Data API.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete, truncate, references, trigger on tables
  from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences
  from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions
  from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions
  from public;

-- Defense in depth: enable RLS on all application tables in public.
-- Do not FORCE RLS here; the backend connection owner still needs Prisma access.
do $$
declare
  table_record record;
begin
  for table_record in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
      and tablename not like '_prisma%'
  loop
    execute format(
      'alter table %I.%I enable row level security',
      table_record.schemaname,
      table_record.tablename
    );
  end loop;
end $$;

commit;
